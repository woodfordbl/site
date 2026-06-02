import { useCallback, useContext, useMemo } from "react";
import type { CanvasEditorContextValue } from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import { placementAfterRow } from "@/lib/blocks/row-placement.ts";
import {
  applyBlockConversion,
  markdownMatchToSlashItem,
} from "@/lib/canvas/apply-block-conversion.ts";
import type {
  BlockEditComponent,
  LeafBlockSpec,
  LeafBlockType,
} from "@/lib/canvas/block-spec.types.ts";
import { findFocusableAdjacentRowId } from "@/lib/canvas/focusable-rows.ts";
import {
  matchMarkdownShortcut,
  requiresTopLevelRow,
} from "@/lib/canvas/markdown-shortcuts.ts";
import { resolveStructuralAction } from "@/lib/canvas/resolve-structural-action.ts";
import { buildStructuralContext } from "@/lib/canvas/structural-context.ts";
import type { BlockEditKeyboardProps } from "@/lib/editor/block-edit-props.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";
import type { Block } from "@/lib/schemas/block.ts";

interface UseBlockFieldActionsOptions extends BlockEditKeyboardProps {
  block: Extract<Block, { type: LeafBlockType }>;
  canvasOverride?: CanvasEditorContextValue | null;
  leafSpec: LeafBlockSpec<LeafBlockType>;
  onBlockChange?: (block: Block) => void;
  row?: CanvasRow;
}

interface UseBlockFieldActionsResult {
  Edit: BlockEditComponent<LeafBlockType>;
  keyboardProps: BlockEditKeyboardProps;
  onChange: (props: Extract<Block, { type: LeafBlockType }>["props"]) => void;
}

function buildDividerEnterHandler(
  canvas: CanvasEditorContextValue,
  rowId: string
): BlockEditKeyboardProps["onEnter"] {
  return () => {
    const placement = placementAfterRow(canvas.rows, rowId);
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

export function useBlockFieldActions({
  autoFocus,
  autoFocusOffset,
  autoFocusPlacement,
  block,
  canvasOverride,
  fieldRef,
  indent: indentProp,
  leafSpec,
  onAutoFocusHandled,
  onBlockChange,
  onEnter,
  onIndentChange,
  onMarkdownShortcut,
  onNavigateDown,
  onNavigateUp,
  onSlash,
  onSlashClose,
  onSlashDismiss,
  onSlashLinkBack,
  onSlashMenuConfirm,
  onSlashMenuNavigate,
  onStructuralKey,
  onTextFocus,
  row,
  slashCaret,
  slashMenuOpen,
  slashPhase,
}: UseBlockFieldActionsOptions): UseBlockFieldActionsResult {
  const contextCanvas = useContext(CanvasEditorContext);
  const canvas = canvasOverride ?? contextCanvas;
  const capabilities = leafSpec.behavior.capabilities;
  const editStrategy = leafSpec.behavior.editStrategy;
  const rowId = row?.rowId ?? `block-${block.id}`;
  const indent = indentProp ?? getBlockIndent(block);
  const useCanvas =
    canvas !== null && row !== undefined && onBlockChange === undefined;

  const setIndent = useCallback(
    (nextIndent: number) => {
      if (!(useCanvas && capabilities.blockIndent && canvas)) {
        onIndentChange?.(nextIndent);
        return;
      }
      canvas.dispatch({
        type: "indent.adjust",
        rowId,
        delta: nextIndent > indent ? 1 : -1,
      });
    },
    [canvas, capabilities.blockIndent, indent, onIndentChange, rowId, useCanvas]
  );

  const handleStructuralKey = useCallback(
    (caretAtStart: boolean, key: "Backspace" | "Delete") => {
      if (onStructuralKey?.(caretAtStart, key)) {
        return true;
      }
      if (!(useCanvas && row && capabilities.structuralKeys && canvas)) {
        return false;
      }
      const ctx = buildStructuralContext(canvas.rows, rowId, {
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
      for (const command of commands) {
        canvas.dispatch(command);
      }
      return true;
    },
    [
      canvas,
      capabilities.structuralKeys,
      onStructuralKey,
      row,
      rowId,
      useCanvas,
    ]
  );

  const handleMarkdownShortcut = useCallback(() => {
    if (!(useCanvas && editStrategy === "inline-text" && row && canvas)) {
      return onMarkdownShortcut?.() ?? false;
    }

    const text = getTextFromBlock(row.effectiveBlock);
    const match = matchMarkdownShortcut(text);
    if (!match) {
      return false;
    }
    if (requiresTopLevelRow(match) && row.effectiveBlock.parentId) {
      return false;
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
  }, [canvas, editStrategy, onMarkdownShortcut, row, rowId, useCanvas]);

  const handleEnter = useMemo(() => {
    if (!(useCanvas && canvas)) {
      return onEnter;
    }

    if (editStrategy === "inline-text" && capabilities.rowSplit) {
      return (selection: FieldSelection) => {
        if (slashMenuOpen) {
          return;
        }
        const liftAtCaretStart =
          row?.effectiveBlock.parentId != null &&
          selection.start === 0 &&
          selection.end === 0;

        if (liftAtCaretStart) {
          canvas.dispatch({ type: "block.liftAsText", rowId });
          return;
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
      return buildDividerEnterHandler(canvas, rowId);
    }

    return onEnter;
  }, [
    block.type,
    canvas,
    capabilities.rowSplit,
    editStrategy,
    onEnter,
    row?.effectiveBlock.parentId,
    rowId,
    slashMenuOpen,
    useCanvas,
  ]);

  const onNavigateDownAction = useCallback(() => {
    if (!(useCanvas && capabilities.focusAdjacent && canvas)) {
      onNavigateDown?.();
      return;
    }
    canvas.dispatch({
      type: "row.focusAdjacent",
      rowId,
      direction: "down",
    });
  }, [canvas, capabilities.focusAdjacent, onNavigateDown, rowId, useCanvas]);

  const onNavigateUpAction = useCallback(() => {
    if (!(useCanvas && capabilities.focusAdjacent && canvas)) {
      onNavigateUp?.();
      return;
    }
    canvas.dispatch({
      type: "row.focusAdjacent",
      rowId,
      direction: "up",
    });
  }, [canvas, capabilities.focusAdjacent, onNavigateUp, rowId, useCanvas]);

  const blurActiveField = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
    canvas?.clearFocus();
  }, [canvas]);

  const onMoveRowUp = useCallback(() => {
    if (!(useCanvas && canvas)) {
      return;
    }
    canvas.dispatch({
      type: "row.moveAdjacent",
      rowId,
      direction: "up",
    });
  }, [canvas, rowId, useCanvas]);

  const onMoveRowDown = useCallback(() => {
    if (!(useCanvas && canvas)) {
      return;
    }
    canvas.dispatch({
      type: "row.moveAdjacent",
      rowId,
      direction: "down",
    });
  }, [canvas, rowId, useCanvas]);

  const extendSelection = useCallback(
    (direction: "up" | "down") => {
      if (!(useCanvas && canvas)) {
        return;
      }
      const adjacentRowId = findFocusableAdjacentRowId(
        canvas.rows,
        rowId,
        direction
      );
      if (!adjacentRowId) {
        return;
      }
      blurActiveField();
      canvas.toggleRowSelection(adjacentRowId, { shiftKey: true });
    },
    [blurActiveField, canvas, rowId, useCanvas]
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
      fieldRef,
      indent,
      onAutoFocusHandled,
      onEnter: handleEnter,
      onIndentChange: capabilities.blockIndent ? setIndent : onIndentChange,
      onMarkdownShortcut: handleMarkdownShortcut,
      onExtendSelectionDown: useCanvas ? onExtendSelectionDown : undefined,
      onExtendSelectionUp: useCanvas ? onExtendSelectionUp : undefined,
      onMoveRowDown: useCanvas ? onMoveRowDown : undefined,
      onMoveRowUp: useCanvas ? onMoveRowUp : undefined,
      onNavigateDown: capabilities.focusAdjacent
        ? onNavigateDownAction
        : onNavigateDown,
      onNavigateUp: capabilities.focusAdjacent
        ? onNavigateUpAction
        : onNavigateUp,
      onSlash: capabilities.slashMenu ? onSlash : undefined,
      onSlashClose,
      onSlashDismiss,
      onSlashLinkBack,
      onSlashMenuConfirm,
      onSlashMenuNavigate,
      onStructuralKey: handleStructuralKey,
      onTextFocus,
      slashCaret,
      slashMenuOpen,
      slashPhase,
    }),
    [
      autoFocus,
      autoFocusOffset,
      autoFocusPlacement,
      capabilities.blockIndent,
      capabilities.focusAdjacent,
      capabilities.slashMenu,
      fieldRef,
      handleEnter,
      handleMarkdownShortcut,
      handleStructuralKey,
      indent,
      onAutoFocusHandled,
      onIndentChange,
      onExtendSelectionDown,
      onExtendSelectionUp,
      onMoveRowDown,
      onMoveRowUp,
      onNavigateDown,
      onNavigateDownAction,
      onNavigateUp,
      onNavigateUpAction,
      useCanvas,
      onSlash,
      onSlashClose,
      onSlashDismiss,
      onSlashLinkBack,
      onSlashMenuConfirm,
      onSlashMenuNavigate,
      onTextFocus,
      setIndent,
      slashCaret,
      slashMenuOpen,
      slashPhase,
    ]
  );

  const persistBlock = useCallback(
    (props: Extract<Block, { type: LeafBlockType }>["props"]) => {
      const nextBlock = { ...block, props } as Block;
      if (useCanvas && canvas) {
        canvas.dispatch({ type: "row.update", rowId, block: nextBlock });
        return;
      }
      onBlockChange?.(nextBlock);
    },
    [block, canvas, onBlockChange, rowId, useCanvas]
  );

  return {
    Edit: leafSpec.Edit as BlockEditComponent<LeafBlockType>,
    keyboardProps,
    onChange: persistBlock,
  };
}
