import { BlockGutter } from "@/components/canvas/block-gutter.tsx";
import {
  useCanvasEditorContext,
  useCanvasSelection,
} from "@/components/canvas/canvas-editor-context.tsx";
import { getCanvasGutterAlignClassName } from "@/lib/blocks/block-spacing.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";

interface RowGutterProps {
  onInsert?: (edge: "before" | "after") => void;
  row: CanvasRow;
}

export function RowGutter({ row, onInsert }: RowGutterProps) {
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

  return (
    <BlockGutter
      alignClassName={getCanvasGutterAlignClassName(row.effectiveBlock)}
      isSelected={isRowSelected(row.rowId)}
      onConvert={(item) => {
        applyBlockConversion(row, item, dispatch);
        dispatch({ type: "focus.set", rowId: row.rowId, placement: "start" });
      }}
      onDelete={() => {
        if (selectedRowIds.length > 1) {
          deleteSelection();
          return;
        }
        deleteRow(row.rowId);
      }}
      onDragInteractionStart={() => clearSelection()}
      onDuplicate={() => duplicateRow(row.rowId)}
      onInsert={
        onInsert ??
        ((edge) =>
          edge === "before" ? insertBefore(row.rowId) : insertAfter(row.rowId))
      }
      onMenuOpen={() => {
        if (!isRowSelected(row.rowId)) {
          selectRow(row.rowId);
        }
      }}
      onSelect={(event) => {
        toggleRowSelection(row.rowId, {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey || event.ctrlKey,
        });
      }}
      rowId={row.rowId}
    />
  );
}
