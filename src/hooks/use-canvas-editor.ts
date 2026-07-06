import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { putAsset } from "@/db/assets/asset-store.ts";
import {
  type ServerPageSource,
  usePageCanvas,
} from "@/db/queries/use-page-canvas.ts";
import { useCanvasRowActions } from "@/hooks/use-canvas-row-actions.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowById, flattenRows } from "@/lib/blocks/block-tree.ts";
import type { RowPlacement } from "@/lib/blocks/row-placement.ts";
import { applyCanvasEffects } from "@/lib/canvas/apply-effects.ts";
import { tryApplyCanvasFocus } from "@/lib/canvas/apply-pending-focus.ts";
import {
  type BlockSelectionState,
  emptyBlockSelection,
  expandUnitContainerSelection,
  getActiveCanvasRowId,
  isRowSelectedInUi,
  normalizeSelectedRowIds,
  rowIdsInDocumentOrder,
  selectAllRows,
  selectionEdgeRowId,
  subtreeBlocksFromSelectedRows,
  toggleBlockSelection,
} from "@/lib/canvas/block-selection.ts";
import { handleCanvasPasteEvent } from "@/lib/canvas/canvas-keyboard-shortcuts.ts";
import {
  blocksToPlainText,
  type CanvasClipboardPayload,
  payloadFromBlocks,
} from "@/lib/canvas/clipboard.ts";
import type { CanvasCommand } from "@/lib/canvas/commands.ts";
import type { FocusState } from "@/lib/canvas/effects.ts";
import {
  findFocusableAdjacentRow,
  findFocusableAdjacentRowId,
  flattenCanvasRows,
} from "@/lib/canvas/focusable-rows.ts";
import { canvasReducer } from "@/lib/canvas/reducer.ts";
import { warnSelectionInvariants } from "@/lib/canvas/selection-invariants.ts";
import { buildAssetMediaBlock } from "@/lib/media/paste-media.ts";
import type { Block } from "@/lib/schemas/block.ts";

/** Stores pasted files as content-addressed assets, returning media blocks in order. */
async function storeFilesAsMediaBlocks(files: File[]): Promise<Block[]> {
  const blocks: Block[] = [];
  for (const file of files) {
    try {
      const { assetId, mimeType } = await putAsset(file);
      blocks.push(
        buildAssetMediaBlock({ assetId, mimeType, fileName: file.name })
      );
    } catch {
      // Skip files that fail to store (e.g. IndexedDB unavailable).
    }
  }
  return blocks;
}

/**
 * Canvas editing state + identity-stable actions. Every action reads volatile
 * state (rows, selection, focus, clipboard) through refs so its identity never
 * changes — the actions context built from these never invalidates consumers.
 */
export function useCanvasEditor(
  serverPage: ServerPageSource,
  pageHasLocalDraft = false
) {
  const [focus, setFocus] = useState<FocusState>(null);
  const canvas = usePageCanvas(serverPage, pageHasLocalDraft);
  const [selection, setSelection] =
    useState<BlockSelectionState>(emptyBlockSelection);
  const [clipboard, setClipboard] = useState<CanvasClipboardPayload | null>(
    null
  );
  const pasteInFlightRef = useRef(false);

  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const clipboardRef = useRef(clipboard);
  clipboardRef.current = clipboard;

  const getRows = useCallback(() => canvasRef.current.getPlacementRows(), []);

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

    if (focus.embedAction) {
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

  // Selection choke point: every selection write is normalized (descendants of
  // a selected ancestor dropped, unknown ids pruned) so no code path can
  // persist an ancestor+descendant selection. Dev builds warn first, since an
  // unnormalized input means the producing code path has a bug.
  const normalizeSelection = useCallback(
    (next: BlockSelectionState): BlockSelectionState => {
      const rows = getRows();
      warnSelectionInvariants(rows, next.selectedRowIds);
      const normalized = normalizeSelectedRowIds(rows, next.selectedRowIds);
      if (normalized.length === next.selectedRowIds.length) {
        return next;
      }
      return { anchorRowId: next.anchorRowId, selectedRowIds: normalized };
    },
    [getRows]
  );

  const toggleRowSelection = useCallback(
    (rowId: string, modifiers?: { metaKey?: boolean; shiftKey?: boolean }) => {
      const focusRowId = focusRef.current?.rowId ?? getActiveCanvasRowId();

      if (modifiers?.shiftKey) {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
          active.blur();
        }
        clearFocus();
      }

      setSelection((current) =>
        normalizeSelection(
          toggleBlockSelection(getRows(), current, rowId, modifiers, focusRowId)
        )
      );
    },
    [clearFocus, getRows, normalizeSelection]
  );

  const selectAll = useCallback(() => {
    setSelection(normalizeSelection(selectAllRows(getRows())));
  }, [getRows, normalizeSelection]);

  const selectRow = useCallback(
    (rowId: string) => {
      setSelection(
        normalizeSelection({
          anchorRowId: rowId,
          selectedRowIds: expandUnitContainerSelection(getRows(), rowId),
        })
      );
    },
    [getRows, normalizeSelection]
  );

  // Replaces the whole selection (marquee drag-select). Bails on identical id
  // lists so per-mousemove calls don't re-render every row.
  const selectRows = useCallback(
    (rowIds: string[]) => {
      setSelection((current) => {
        if (
          current.selectedRowIds.length === rowIds.length &&
          current.selectedRowIds.every((id, index) => id === rowIds[index])
        ) {
          return current;
        }
        if (rowIds.length === 0) {
          return emptyBlockSelection;
        }
        return normalizeSelection({
          anchorRowId: rowIds[0] ?? null,
          selectedRowIds: rowIds,
        });
      });
    },
    [normalizeSelection]
  );

  const applyCommandEffects = useCallback((command: CanvasCommand) => {
    const current = canvasRef.current;
    const result = canvasReducer({ rows: current.getPlacementRows() }, command);

    applyCanvasEffects(
      result.effects,
      {
        saveRow: current.saveRowById,
        savePageBlocks: current.persistPageBlocks,
        insertRow: (position: RowPlacement, block: Block) =>
          current.insertRowAtPosition(position, block),
        deleteRow: current.deleteRowById,
        moveRow: current.moveRowById,
        revertToServer: current.revertToServer,
        acknowledgeServerBaseline: current.acknowledgeServerBaseline,
      },
      current.rows,
      setFocus
    );
  }, []);

  const dispatch = useCallback(
    (command: CanvasCommand) => {
      canvasRef.current.runBlockTransaction(
        () => {
          applyCommandEffects(command);
        },
        // Keystroke commits are one row.update per keypress; coalesce a burst
        // in the same block into a single undo entry.
        command.type === "row.update"
          ? { historyCoalesceKey: `row.update:${command.rowId}` }
          : undefined
      );
    },
    [applyCommandEffects]
  );

  const dispatchCommands = useCallback(
    (commands: CanvasCommand[]) => {
      if (commands.length === 0) {
        return;
      }

      canvasRef.current.runBlockTransaction(() => {
        for (const command of commands) {
          applyCommandEffects(command);
        }
      });
    },
    [applyCommandEffects]
  );

  const getPlacementRows = useCallback(
    () => canvasRef.current.getPlacementRows(),
    []
  );

  const rowActions = useCanvasRowActions({
    getPlacementRows,
    dispatch,
  });

  const copyBlocksToClipboard = useCallback(async (blocks: Block[]) => {
    if (blocks.length === 0) {
      return;
    }

    setClipboard(payloadFromBlocks(blocks));

    try {
      await navigator.clipboard.writeText(blocksToPlainText(blocks));
    } catch {
      // Local clipboard state is enough for paste within the canvas.
    }
  }, []);

  const copySelection = useCallback(async () => {
    await copyBlocksToClipboard(
      subtreeBlocksFromSelectedRows(
        getRows(),
        selectionRef.current.selectedRowIds
      )
    );
  }, [copyBlocksToClipboard, getRows]);

  const copyRow = useCallback(
    async (rowId: string) => {
      const row = findRowById(getRows(), rowId);
      if (!row) {
        return;
      }

      await copyBlocksToClipboard(
        flattenRows([row]).map((flatRow) => flatRow.effectiveBlock)
      );
    },
    [copyBlocksToClipboard, getRows]
  );

  const deleteSelection = useCallback(() => {
    const selectedRowIds = selectionRef.current.selectedRowIds;
    if (selectedRowIds.length === 0) {
      return;
    }

    dispatch({ type: "selection.delete", rowIds: selectedRowIds });
    clearSelection();
  }, [clearSelection, dispatch]);

  const moveSelectedRowAdjacent = useCallback(
    (direction: "up" | "down") => {
      const current = selectionRef.current;
      const rowId =
        current.anchorRowId ??
        rowIdsInDocumentOrder(getRows(), current.selectedRowIds).at(-1);
      if (!rowId) {
        return;
      }
      dispatch({ type: "row.moveAdjacent", rowId, direction });
    },
    [dispatch, getRows]
  );

  const extendSelectionAdjacent = useCallback(
    (direction: "up" | "down") => {
      const rows = getRows();
      const rowId = selectionEdgeRowId(
        rows,
        selectionRef.current.selectedRowIds,
        direction
      );
      if (!rowId) {
        return;
      }
      const adjacentRowId = findFocusableAdjacentRowId(rows, rowId, direction);
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
    [clearFocus, getRows, toggleRowSelection]
  );

  const deleteRow = useCallback(
    (rowId: string) => {
      const flat = flattenCanvasRows(getRows());
      const index = flat.findIndex((row) => row.rowId === rowId);
      const previous =
        index > 0 ? findFocusableAdjacentRow(flat, index, "up") : null;
      const commands: CanvasCommand[] = [{ type: "row.delete", rowId }];
      if (previous) {
        commands.push({
          type: "focus.set",
          rowId: previous.rowId,
          placement: "end",
        });
      }
      dispatchCommands(commands);
      clearSelection();
    },
    [clearSelection, dispatchCommands, getRows]
  );

  const duplicateRow = useCallback(
    (rowId: string) => {
      const row = findRowById(getRows(), rowId);
      if (!row) {
        return;
      }

      dispatch({
        type: "rows.paste",
        targetRowId: rowId,
        blocks: flattenRows([row]).map((flatRow) => flatRow.effectiveBlock),
        focusPlacement: "end",
      });
    },
    [dispatch, getRows]
  );

  const resolvePasteTargetRowId = useCallback(() => {
    const rows = getRows();
    return (
      rowIdsInDocumentOrder(rows, selectionRef.current.selectedRowIds).at(-1) ??
      focusRef.current?.rowId ??
      getActiveCanvasRowId() ??
      rows.at(-1)?.rowId
    );
  }, [getRows]);

  const pasteClipboard = useCallback(() => {
    const payload = clipboardRef.current;
    if (!payload?.blocks.length || pasteInFlightRef.current) {
      return;
    }

    pasteInFlightRef.current = true;

    const targetRowId = resolvePasteTargetRowId();

    if (!targetRowId) {
      pasteInFlightRef.current = false;
      return;
    }

    rowActions.pasteAfter(targetRowId, payload.blocks);
    clearSelection();

    queueMicrotask(() => {
      pasteInFlightRef.current = false;
    });
  }, [clearSelection, resolvePasteTargetRowId, rowActions]);

  const insertMediaFiles = useCallback(
    (files: File[]) => {
      const targetRowId = resolvePasteTargetRowId();
      if (!targetRowId) {
        return;
      }

      // Store assets and insert blocks asynchronously; the paste handler that
      // calls this has already claimed the event by the time the bytes land.
      storeFilesAsMediaBlocks(files)
        .then((blocks) => {
          if (blocks.length === 0) {
            return;
          }
          rowActions.pasteAfter(targetRowId, blocks);
          clearSelection();
        })
        .catch(() => undefined);
    },
    [clearSelection, resolvePasteTargetRowId, rowActions]
  );

  const handleCanvasPaste = useCallback(
    (event: ClipboardEvent) => {
      handleCanvasPasteEvent(event, {
        clipboard: clipboardRef.current,
        copySelection,
        deleteSelection,
        insertMediaFiles,
        pasteClipboard,
        selectAll,
        selectedCount: selectionRef.current.selectedRowIds.length,
      });
    },
    [
      copySelection,
      deleteSelection,
      insertMediaFiles,
      pasteClipboard,
      selectAll,
    ]
  );

  const isRowSelected = useCallback(
    (rowId: string) => isRowSelectedInUi(canvas.rows, selection, rowId),
    [canvas.rows, selection]
  );

  const saveRow = useCallback((row: CanvasRow, block: Block) => {
    canvasRef.current.saveRow(row, block);
  }, []);

  const insertRow = useCallback(
    (
      placement: RowPlacement,
      type?: Parameters<typeof canvas.insertRow>[1],
      insertOptions?: Parameters<typeof canvas.insertRow>[2]
    ) => canvasRef.current.insertRow(placement, type, insertOptions),
    []
  );

  return useMemo(
    () => ({
      rows: canvas.rows as CanvasRow[],
      getRows,
      dispatch,
      dispatchCommands,
      ...rowActions,
      focus,
      clearFocus,
      selection,
      selectedRowIds: selection.selectedRowIds,
      toggleRowSelection,
      selectAll,
      selectRow,
      selectRows,
      clearSelection,
      isRowSelected,
      copySelection,
      copyRow,
      deleteSelection,
      deleteRow,
      duplicateRow,
      pasteClipboard,
      clipboard,
      handleCanvasPaste,
      moveSelectedRowAdjacent,
      extendSelectionAdjacent,
      saveRow,
      insertRow,
      hasLocalChanges: canvas.hasLocalChanges,
      isStale: canvas.isStale,
      resetToServer: canvas.resetToServer,
      undoEdit: canvas.undoEdit,
      redoEdit: canvas.redoEdit,
    }),
    [
      canvas.rows,
      saveRow,
      insertRow,
      canvas.hasLocalChanges,
      canvas.isStale,
      canvas.resetToServer,
      canvas.undoEdit,
      canvas.redoEdit,
      getRows,
      dispatch,
      dispatchCommands,
      rowActions,
      focus,
      clearFocus,
      selection,
      toggleRowSelection,
      selectAll,
      selectRow,
      selectRows,
      clearSelection,
      isRowSelected,
      copySelection,
      copyRow,
      deleteSelection,
      deleteRow,
      duplicateRow,
      pasteClipboard,
      clipboard,
      handleCanvasPaste,
      moveSelectedRowAdjacent,
      extendSelectionAdjacent,
    ]
  );
}
