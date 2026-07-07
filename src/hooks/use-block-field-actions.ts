import { useCallback, useMemo } from "react";
import {
  useCanvasEditorContext,
  useCanvasSelection,
} from "@/components/canvas/canvas-editor-context.tsx";
import { useRowSlash } from "@/components/canvas/canvas-slash-context.tsx";
import type { LeafBlockType } from "@/lib/blocks/block-defs.ts";
import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { type CanvasRow, findRowContext } from "@/lib/blocks/block-tree.ts";
import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import { placementAfterRow } from "@/lib/blocks/row-placement.ts";
import {
  applyBlockConversion,
  markdownMatchToSlashItem,
} from "@/lib/canvas/apply-block-conversion.ts";
import { isAllowedChild } from "@/lib/canvas/block-container-config.ts";
import { shouldLiftContainerChildOnEnterAtCaretStart } from "@/lib/canvas/block-interactions.ts";
import type {
  BlockEditComponent,
  LeafBlockSpec,
} from "@/lib/canvas/block-spec.types.ts";
import { resolveDuplicateRowId } from "@/lib/canvas/duplicate-row-target.ts";
import { findFocusableAdjacentRowId } from "@/lib/canvas/focusable-rows.ts";
import {
  markdownShortcutResultType,
  matchMarkdownShortcut,
} from "@/lib/canvas/markdown-shortcuts.ts";
import { resolveStructuralAction } from "@/lib/canvas/resolve-structural-action.ts";
import { buildStructuralContext } from "@/lib/canvas/structural-context.ts";
import type { BlockEditKeyboardProps } from "@/lib/editor/block-edit-props.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";
import type { Block } from "@/lib/schemas/block.ts";

interface UseBlockFieldActionsOptions {
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  block: Extract<Block, { type: LeafBlockType }>;
  leafSpec: LeafBlockSpec<LeafBlockType>;
  onAutoFocusHandled?: () => void;
  row: CanvasRow;
}

interface UseBlockFieldActionsResult {
  Edit: BlockEditComponent<LeafBlockType>;
  keyboardProps: BlockEditKeyboardProps;
  onChange: (props: Extract<Block, { type: LeafBlockType }>["props"]) => void;
}

/**
 * Wires a leaf block's edit surface to the canvas: structural keys, Enter
 * split/lift, markdown + slash shortcuts, indent, navigation, persistence.
 * Reads live rows via `getRows()` so the callbacks stay identity-stable.
 */
export function useBlockFieldActions({
  autoFocus,
  autoFocusOffset,
  autoFocusPlacement,
  block,
  leafSpec,
  onAutoFocusHandled,
  row,
}: UseBlockFieldActionsOptions): UseBlockFieldActionsResult {
  const canvas = useCanvasEditorContext();
  const { selectedRowIds } = useCanvasSelection();
  const hasBlockSelection = selectedRowIds.length > 0;
  const capabilities = leafSpec.behavior.capabilities;
  const editStrategy = leafSpec.behavior.editStrategy;
  const rowId = row.rowId;
  const indent = getBlockIndent(block);
  const slash = useRowSlash(rowId, capabilities.slashMenu);
  const slashMenuOpen = slash.slashMenuOpen;

  const setIndent = useCallback(
    (nextIndent: number) => {
      canvas.dispatch({
        type: "indent.adjust",
        rowId,
        delta: nextIndent > indent ? 1 : -1,
      });
    },
    [canvas, indent, rowId]
  );

  const handleStructuralKey = useCallback(
    (caretAtStart: boolean, key: "Backspace" | "Delete") => {
      if (!capabilities.structuralKeys) {
        return false;
      }
      const ctx = buildStructuralContext(canvas.getRows(), rowId, {
        caretAtStart,
        key,
      });
      if (!ctx) {
        return false;
      }
      const commands = resolveStructuralAction(ctx);
      if (commands.length === 0) {
        return false;
      }
      canvas.dispatchCommands(commands);
      return true;
    },
    [canvas, capabilities.structuralKeys, rowId]
  );

  const handleMarkdownShortcut = useCallback(() => {
    if (editStrategy !== "inline-text") {
      return false;
    }

    const text = getTextFromBlock(row.effectiveBlock);
    const match = matchMarkdownShortcut(text);
    if (!match) {
      return false;
    }
    // Structural shortcuts work at the top level and inside generic-scope
    // containers (toggle headings, columns, tabs). Inside a type-restricted
    // container (list, checklist) the result type isn't an allowed child, so
    // the shortcut is suppressed.
    if (row.effectiveBlock.parentId) {
      const parentType = findRowContext(canvas.getRows(), rowId)?.parent
        ?.effectiveBlock.type;
      if (
        !(
          parentType &&
          isAllowedChild(parentType, markdownShortcutResultType(match))
        )
      ) {
        return false;
      }
    }

    applyBlockConversion(
      row,
      markdownMatchToSlashItem(match),
      canvas.dispatch,
      {
        text: "",
      }
    );
    canvas.dispatch({ type: "focus.set", rowId, placement: "start" });
    return true;
  }, [canvas, editStrategy, row, rowId]);

  const handleEnter = useMemo(() => {
    if (editStrategy === "inline-text" && capabilities.rowSplit) {
      return (selection: FieldSelection) => {
        if (slashMenuOpen) {
          return;
        }
        const liftAtCaretStart =
          row.effectiveBlock.parentId != null &&
          selection.start === 0 &&
          selection.end === 0;

        if (liftAtCaretStart) {
          const rowContext = findRowContext(canvas.getRows(), rowId);
          if (
            shouldLiftContainerChildOnEnterAtCaretStart(
              rowContext?.parent ?? null
            )
          ) {
            canvas.dispatch({ type: "block.liftAsText", rowId });
            return;
          }
        }

        canvas.dispatch({
          type: "row.split",
          rowId,
          start: selection.start,
          end: selection.end,
        });
      };
    }

    if (editStrategy === "inline-custom" && block.type === "divider") {
      return () => {
        const placement = placementAfterRow(canvas.getRows(), rowId);
        if (!placement) {
          return;
        }
        canvas.dispatch({
          type: "row.insert",
          position: placement,
          blockType: "text",
        });
      };
    }

    return;
  }, [
    block.type,
    canvas,
    capabilities.rowSplit,
    editStrategy,
    row.effectiveBlock.parentId,
    rowId,
    slashMenuOpen,
  ]);

  const onNavigate = useCallback(
    (direction: "up" | "down") => {
      canvas.dispatch({ type: "row.focusAdjacent", rowId, direction });
    },
    [canvas, rowId]
  );

  const onNavigateUpAction = useCallback(() => onNavigate("up"), [onNavigate]);
  const onNavigateDownAction = useCallback(
    () => onNavigate("down"),
    [onNavigate]
  );

  const onMoveRow = useCallback(
    (direction: "up" | "down") => {
      canvas.dispatch({ type: "row.moveAdjacent", rowId, direction });
    },
    [canvas, rowId]
  );

  const onMoveRowUp = useCallback(() => onMoveRow("up"), [onMoveRow]);
  const onMoveRowDown = useCallback(() => onMoveRow("down"), [onMoveRow]);

  const onMoveSelectedRow = useCallback(
    (direction: "up" | "down") => {
      canvas.moveSelectedRowAdjacent(direction);
    },
    [canvas]
  );

  const onMoveSelectedRowUp = useCallback(
    () => onMoveSelectedRow("up"),
    [onMoveSelectedRow]
  );
  const onMoveSelectedRowDown = useCallback(
    () => onMoveSelectedRow("down"),
    [onMoveSelectedRow]
  );

  const onDeleteSelection = useCallback(() => {
    canvas.deleteSelection();
  }, [canvas]);

  const onDuplicate = useCallback(() => {
    const targetRowId = resolveDuplicateRowId(canvas.getRows(), {
      rowId,
      selectedRowIds: hasBlockSelection ? selectedRowIds : [],
    });
    if (targetRowId) {
      canvas.duplicateRow(targetRowId);
    }
  }, [canvas, hasBlockSelection, rowId, selectedRowIds]);

  const extendSelection = useCallback(
    (direction: "up" | "down") => {
      const adjacentRowId = findFocusableAdjacentRowId(
        canvas.getRows(),
        rowId,
        direction
      );
      if (!adjacentRowId) {
        return;
      }
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
      canvas.clearFocus();
      canvas.toggleRowSelection(adjacentRowId, { shiftKey: true });
    },
    [canvas, rowId]
  );

  const onExtendSelectionUp = useCallback(
    () => extendSelection("up"),
    [extendSelection]
  );

  const onExtendSelectionDown = useCallback(
    () => extendSelection("down"),
    [extendSelection]
  );

  const keyboardProps = useMemo<BlockEditKeyboardProps>(
    () => ({
      autoFocus,
      autoFocusOffset,
      autoFocusPlacement,
      hasBlockSelection,
      indent,
      onAutoFocusHandled,
      onDeleteSelection: hasBlockSelection ? onDeleteSelection : undefined,
      onDuplicate,
      onEnter: handleEnter,
      onIndentChange: capabilities.blockIndent ? setIndent : undefined,
      onMarkdownShortcut: handleMarkdownShortcut,
      onExtendSelectionDown,
      onExtendSelectionUp,
      onMoveRowDown,
      onMoveRowUp,
      onMoveSelectedRowDown: hasBlockSelection
        ? onMoveSelectedRowDown
        : undefined,
      onMoveSelectedRowUp: hasBlockSelection ? onMoveSelectedRowUp : undefined,
      onNavigateDown: capabilities.focusAdjacent
        ? onNavigateDownAction
        : undefined,
      onNavigateUp: capabilities.focusAdjacent ? onNavigateUpAction : undefined,
      onSlash: slash.onSlash,
      onSlashClose: slash.onSlashClose,
      onSlashDismiss: slash.onSlashDismiss,
      onSlashLinkBack: slash.onSlashLinkBack,
      onSlashMenuConfirm: slash.onSlashMenuConfirm,
      onSlashMenuNavigate: slash.onSlashMenuNavigate,
      onStructuralKey: handleStructuralKey,
      onTextFocus: canvas.clearSelection,
      slashCaret: slash.slashCaret,
      slashMenuOpen: slash.slashMenuOpen,
      slashPhase: slash.slashPhase,
    }),
    [
      autoFocus,
      autoFocusOffset,
      autoFocusPlacement,
      canvas.clearSelection,
      hasBlockSelection,
      capabilities.blockIndent,
      capabilities.focusAdjacent,
      handleEnter,
      handleMarkdownShortcut,
      handleStructuralKey,
      indent,
      onAutoFocusHandled,
      onDeleteSelection,
      onDuplicate,
      onExtendSelectionDown,
      onExtendSelectionUp,
      onMoveRowDown,
      onMoveRowUp,
      onMoveSelectedRowDown,
      onMoveSelectedRowUp,
      onNavigateDownAction,
      onNavigateUpAction,
      setIndent,
      slash,
    ]
  );

  const persistBlock = useCallback(
    (props: Extract<Block, { type: LeafBlockType }>["props"]) => {
      const nextBlock = { ...block, props } as Block;
      canvas.dispatch({ type: "row.update", rowId, block: nextBlock });
    },
    [block, canvas, rowId]
  );

  return {
    Edit: leafSpec.Edit as BlockEditComponent<LeafBlockType>,
    keyboardProps,
    onChange: persistBlock,
  };
}
