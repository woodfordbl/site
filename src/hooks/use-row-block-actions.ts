import { useCallback } from "react";

import {
  useCanvasEditorContext,
  useCanvasSelection,
} from "@/components/canvas/canvas-editor-context.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";

interface RowBlockActions {
  onConvert: (item: SlashMenuItem) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMenuOpen: () => void;
}

/** Shared block-menu actions for a canvas row (gutter dropdown or touch drawer). */
export function useRowBlockActions(row: CanvasRow): RowBlockActions {
  const { deleteRow, deleteSelection, dispatch, duplicateRow, selectRow } =
    useCanvasEditorContext();
  const { isRowSelected, selectedRowIds } = useCanvasSelection();

  const onConvert = useCallback(
    (item: SlashMenuItem) => {
      applyBlockConversion(row, item, dispatch);
      dispatch({ type: "focus.set", rowId: row.rowId, placement: "start" });
    },
    [dispatch, row]
  );

  const onDelete = useCallback(() => {
    if (selectedRowIds.length > 1) {
      deleteSelection();
      return;
    }
    deleteRow(row.rowId);
  }, [deleteRow, deleteSelection, row.rowId, selectedRowIds.length]);

  const onDuplicate = useCallback(() => {
    duplicateRow(row.rowId);
  }, [duplicateRow, row.rowId]);

  const onMenuOpen = useCallback(() => {
    if (!isRowSelected(row.rowId)) {
      selectRow(row.rowId);
    }
  }, [isRowSelected, row.rowId, selectRow]);

  return {
    onConvert,
    onDelete,
    onDuplicate,
    onMenuOpen,
  };
}
