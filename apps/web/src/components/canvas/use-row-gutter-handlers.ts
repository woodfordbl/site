import type { MouseEvent } from "react";
import { useMemo } from "react";

import {
  useCanvasEditorContext,
  useCanvasSelection,
} from "@/components/canvas/canvas-editor-context.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";

export interface RowGutterHandlers {
  isSelected: boolean;
  onConvert: (item: SlashMenuItem) => void;
  onDelete: () => void;
  onDragInteractionStart: () => void;
  onDuplicate: () => void;
  onInsert: (edge: "before" | "after") => void;
  onMenuOpen: () => void;
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Editor-bound handlers for a row's block actions (convert / duplicate / delete /
 * insert / select). Shared by the desktop {@link RowGutter} and the mobile
 * actions drawer so both drive the same editor behaviour.
 */
export function useRowGutterHandlers(row: CanvasRow): RowGutterHandlers {
  const {
    deleteRow,
    deleteSelection,
    dispatch,
    duplicateRow,
    insertAfter,
    insertBefore,
    clearSelection,
    selectRow,
    toggleRowSelection,
  } = useCanvasEditorContext();
  const { isRowSelected, selectedRowIds } = useCanvasSelection();

  const rowId = row.rowId;
  const isSelected = isRowSelected(rowId);

  return useMemo<RowGutterHandlers>(
    () => ({
      isSelected,
      onConvert: (item) => {
        applyBlockConversion(row, item, dispatch, { absorb: true });
        dispatch({ type: "focus.set", rowId, placement: "start" });
      },
      onDelete: () => {
        if (selectedRowIds.length > 1) {
          deleteSelection();
          return;
        }
        deleteRow(rowId);
      },
      onDragInteractionStart: () => clearSelection(),
      onDuplicate: () => duplicateRow(rowId),
      onInsert: (edge) =>
        edge === "before" ? insertBefore(rowId) : insertAfter(rowId),
      onMenuOpen: () => {
        if (!isRowSelected(rowId)) {
          selectRow(rowId);
        }
      },
      onSelect: (event) => {
        toggleRowSelection(rowId, {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey || event.ctrlKey,
        });
      },
    }),
    [
      clearSelection,
      deleteRow,
      deleteSelection,
      dispatch,
      duplicateRow,
      insertAfter,
      insertBefore,
      isRowSelected,
      isSelected,
      row,
      rowId,
      selectRow,
      selectedRowIds.length,
      toggleRowSelection,
    ]
  );
}
