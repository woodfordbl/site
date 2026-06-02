import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { findRowById } from "@/db/queries/merge-blocks.ts";
import {
  type ServerPageSource,
  usePageCanvas,
} from "@/db/queries/use-page-canvas.ts";
import { useCanvasRowActions } from "@/hooks/use-canvas-row-actions.ts";
import type { RowPlacement } from "@/lib/blocks/row-placement.ts";
import { applyCanvasEffects } from "@/lib/canvas/apply-effects.ts";
import { tryApplyCanvasFocus } from "@/lib/canvas/apply-pending-focus.ts";
import {
  type BlockSelectionState,
  blocksFromSelectedRows,
  emptyBlockSelection,
  expandListContainerSelection,
  getActiveCanvasRowId,
  isRowSelectedInUi,
  rowIdsInDocumentOrder,
  selectAllRows,
  selectionEdgeRowId,
  toggleBlockSelection,
} from "@/lib/canvas/block-selection.ts";
import { isContainerBlockType } from "@/lib/canvas/block-spec.types.ts";
import {
  handleCanvasKeyboardShortcut,
  handleCanvasPasteEvent,
} from "@/lib/canvas/canvas-keyboard-shortcuts.ts";
import {
  blocksToPlainText,
  type CanvasClipboardPayload,
  cloneBlocksForPaste,
  payloadFromBlocks,
} from "@/lib/canvas/clipboard.ts";
import { cloneRowSubtreeBlocks } from "@/lib/canvas/clone-row-subtree.ts";
import type { CanvasCommand } from "@/lib/canvas/commands.ts";
import type { FocusState } from "@/lib/canvas/effects.ts";
import { findFocusableAdjacentRowId } from "@/lib/canvas/focusable-rows.ts";
import { canvasReducer } from "@/lib/canvas/reducer.ts";
import type { DropTarget } from "@/lib/canvas/resolve-drop-target.ts";
import type { Block } from "@/lib/schemas/block.ts";

export function useCanvasEditor(
  serverPage: ServerPageSource,
  options?: {
    onSaveAuthor?: (
      blocks: Block[],
      title: string,
      slug: string
    ) => Promise<void>;
  }
) {
  const [focus, setFocus] = useState<FocusState>(null);
  const canvas = usePageCanvas(serverPage, {
    focusedBlockId: focus?.rowId ?? null,
  });
  const [selection, setSelection] =
    useState<BlockSelectionState>(emptyBlockSelection);
  const [draggingRowId, setDraggingRowIdState] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [clipboard, setClipboard] = useState<CanvasClipboardPayload | null>(
    null
  );
  const pasteInFlightRef = useRef(false);
  const setDraggingRowId = useCallback((rowId: string | null) => {
    setDraggingRowIdState(rowId);
    if (!rowId) {
      setDropTarget(null);
    }
  }, []);

  const clearDropTarget = useCallback(() => {
    setDropTarget(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(emptyBlockSelection);
  }, []);

  const clearFocus = useCallback(() => {
    setFocus(null);
  }, []);

  useLayoutEffect(() => {
    if (!focus) {
      return;
    }

    let frame = 0;
    let cancelled = false;

    const attempt = () => {
      if (cancelled) {
        return;
      }
      if (tryApplyCanvasFocus(canvas.rows, focus)) {
        clearFocus();
        return;
      }
      frame += 1;
      if (frame < 16) {
        requestAnimationFrame(attempt);
      }
    };

    attempt();
    return () => {
      cancelled = true;
    };
  }, [canvas.rows, clearFocus, focus]);

  const toggleRowSelection = useCallback(
    (rowId: string, modifiers?: { metaKey?: boolean; shiftKey?: boolean }) => {
      if (modifiers?.shiftKey) {
        const focusRowId = focus?.rowId ?? getActiveCanvasRowId();
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
          active.blur();
        }
        clearFocus();

        setSelection((current) =>
          toggleBlockSelection(
            canvas.rows,
            current,
            rowId,
            modifiers,
            focusRowId
          )
        );
        return;
      }

      const focusRowId = focus?.rowId ?? getActiveCanvasRowId();
      setSelection((current) =>
        toggleBlockSelection(canvas.rows, current, rowId, modifiers, focusRowId)
      );
    },
    [canvas.rows, clearFocus, focus?.rowId]
  );

  const selectAll = useCallback(() => {
    setSelection(selectAllRows(canvas.rows));
  }, [canvas.rows]);

  const selectRow = useCallback(
    (rowId: string) => {
      setSelection({
        anchorRowId: rowId,
        selectedRowIds: expandListContainerSelection(canvas.rows, rowId),
      });
    },
    [canvas.rows]
  );

  const dispatch = useCallback(
    (command: CanvasCommand) => {
      canvas.runBlockTransaction(() => {
        const result = canvasReducer(
          {
            rows: canvas.getPlacementRows(),
            serverBlocks: canvas.serverBlocks,
          },
          command
        );

        applyCanvasEffects(
          result.effects,
          {
            saveRow: canvas.saveRowById,
            insertRow: (position: RowPlacement, block: Block) =>
              canvas.insertRowAtPosition(position, block),
            deleteRow: canvas.deleteRowById,
            moveRow: canvas.moveRowById,
            revertToServer: canvas.revertToServer,
            acknowledgeServerBaseline: canvas.acknowledgeServerBaseline,
            saveAuthorPage: async (_authorPageId, blocks, title, slug) => {
              await options?.onSaveAuthor?.(blocks, title, slug);
            },
          },
          canvas.rows,
          setFocus
        );
      });
    },
    [canvas, options]
  );

  const rowActions = useCanvasRowActions({
    getPlacementRows: canvas.getPlacementRows,
    dispatch,
  });

  const copySelection = useCallback(async () => {
    const selectedRows = blocksFromSelectedRows(
      canvas.rows,
      selection.selectedRowIds
    );
    if (selectedRows.length === 0) {
      return;
    }

    const blocks = selectedRows.map((row) => row.effectiveBlock);
    const payload = payloadFromBlocks(blocks);
    setClipboard(payload);

    try {
      await navigator.clipboard.writeText(blocksToPlainText(blocks));
    } catch {
      // Local clipboard state is enough for paste within the canvas.
    }
  }, [canvas.rows, selection.selectedRowIds]);

  const deleteSelection = useCallback(() => {
    if (selection.selectedRowIds.length === 0) {
      return;
    }

    dispatch({
      type: "selection.delete",
      rowIds: selection.selectedRowIds,
    });
    clearSelection();
  }, [clearSelection, dispatch, selection.selectedRowIds]);

  const moveSelectedRowAdjacent = useCallback(
    (direction: "up" | "down") => {
      const rowId =
        selection.anchorRowId ??
        rowIdsInDocumentOrder(canvas.rows, selection.selectedRowIds).at(-1);
      if (!rowId) {
        return;
      }
      dispatch({ type: "row.moveAdjacent", rowId, direction });
    },
    [canvas.rows, dispatch, selection.anchorRowId, selection.selectedRowIds]
  );

  const extendSelectionAdjacent = useCallback(
    (direction: "up" | "down") => {
      const rowId = selectionEdgeRowId(
        canvas.rows,
        selection.selectedRowIds,
        direction
      );
      if (!rowId) {
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
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
      clearFocus();
      toggleRowSelection(adjacentRowId, { shiftKey: true });
    },
    [canvas.rows, clearFocus, selection.selectedRowIds, toggleRowSelection]
  );

  const copyRow = useCallback(
    async (rowId: string) => {
      const row = findRowById(canvas.rows, rowId);
      if (!row) {
        return;
      }

      const blocks = [row.effectiveBlock];
      const payload = payloadFromBlocks(blocks);
      setClipboard(payload);

      try {
        await navigator.clipboard.writeText(blocksToPlainText(blocks));
      } catch {
        // Local clipboard state is enough for paste within the canvas.
      }
    },
    [canvas.rows]
  );

  const deleteRow = useCallback(
    (rowId: string) => {
      dispatch({ type: "row.delete", rowId });
      clearSelection();
    },
    [clearSelection, dispatch]
  );

  const duplicateRow = useCallback(
    (rowId: string) => {
      const row = findRowById(canvas.rows, rowId);
      if (!row) {
        return;
      }

      if (isContainerBlockType(row.effectiveBlock.type)) {
        dispatch({
          type: "rows.paste",
          targetRowId: rowId,
          blocks: cloneRowSubtreeBlocks(row),
          structured: true,
        });
        return;
      }

      rowActions.pasteAfter(rowId, cloneBlocksForPaste([row.effectiveBlock]));
    },
    [canvas.rows, dispatch, rowActions]
  );

  const pasteClipboard = useCallback(() => {
    if (!clipboard?.blocks.length || pasteInFlightRef.current) {
      return;
    }

    pasteInFlightRef.current = true;

    const targetRowId =
      rowIdsInDocumentOrder(canvas.rows, selection.selectedRowIds).at(-1) ??
      focus?.rowId ??
      canvas.rows.at(-1)?.rowId;

    if (!targetRowId) {
      pasteInFlightRef.current = false;
      return;
    }

    rowActions.pasteAfter(targetRowId, clipboard.blocks);
    clearSelection();

    queueMicrotask(() => {
      pasteInFlightRef.current = false;
    });
  }, [
    canvas.rows,
    clearSelection,
    clipboard,
    focus?.rowId,
    rowActions,
    selection.selectedRowIds,
  ]);

  const handleCanvasKeyDown = useCallback(
    (event: KeyboardEvent) => {
      handleCanvasKeyboardShortcut(event, {
        clipboard,
        copySelection,
        deleteSelection,
        extendSelectionDown: () => extendSelectionAdjacent("down"),
        extendSelectionUp: () => extendSelectionAdjacent("up"),
        moveRowDown: () => moveSelectedRowAdjacent("down"),
        moveRowUp: () => moveSelectedRowAdjacent("up"),
        pasteClipboard,
        selectAll,
        selectedCount: selection.selectedRowIds.length,
      });
    },
    [
      clipboard,
      copySelection,
      deleteSelection,
      extendSelectionAdjacent,
      moveSelectedRowAdjacent,
      pasteClipboard,
      selectAll,
      selection.selectedRowIds.length,
    ]
  );

  const handleCanvasPaste = useCallback(
    (event: ClipboardEvent) => {
      handleCanvasPasteEvent(event, {
        clipboard,
        copySelection,
        deleteSelection,
        pasteClipboard,
        selectAll,
        selectedCount: selection.selectedRowIds.length,
      });
    },
    [
      clipboard,
      copySelection,
      deleteSelection,
      pasteClipboard,
      selectAll,
      selection.selectedRowIds.length,
    ]
  );

  const dispatchForRow = useCallback(
    (
      rowId: string,
      command: Omit<CanvasCommand, "rowId"> & { rowId?: string }
    ) => {
      dispatch({ ...command, rowId } as CanvasCommand);
    },
    [dispatch]
  );

  const isRowSelected = useCallback(
    (rowId: string) => isRowSelectedInUi(canvas.rows, selection, rowId),
    [canvas.rows, selection]
  );

  return useMemo(
    () => ({
      rows: canvas.rows as CanvasRow[],
      dispatch,
      dispatchForRow,
      ...rowActions,
      focus,
      clearFocus,
      selection,
      selectedRowIds: selection.selectedRowIds,
      toggleRowSelection,
      selectAll,
      selectRow,
      clearSelection,
      isRowSelected,
      copySelection,
      copyRow,
      deleteSelection,
      deleteRow,
      duplicateRow,
      pasteClipboard,
      clipboard,
      handleCanvasKeyDown,
      handleCanvasPaste,
      moveSelectedRowAdjacent,
      extendSelectionAdjacent,
      draggingRowId,
      setDraggingRowId,
      dropTarget,
      setDropTarget,
      clearDropTarget,
      saveRow: canvas.saveRow,
      insertRow: canvas.insertRow,
      hasLocalChanges: canvas.hasLocalChanges,
      isStale: canvas.isStale,
      resetToServer: canvas.resetToServer,
    }),
    [
      canvas,
      dispatch,
      dispatchForRow,
      rowActions,
      focus,
      clearFocus,
      selection,
      toggleRowSelection,
      selectAll,
      selectRow,
      clearSelection,
      isRowSelected,
      copySelection,
      copyRow,
      deleteSelection,
      deleteRow,
      duplicateRow,
      pasteClipboard,
      clipboard,
      handleCanvasKeyDown,
      handleCanvasPaste,
      moveSelectedRowAdjacent,
      extendSelectionAdjacent,
      draggingRowId,
      setDraggingRowId,
      dropTarget,
      clearDropTarget,
    ]
  );
}
