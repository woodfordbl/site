import { BlockGutter } from "@/components/canvas/block-gutter.tsx";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import type { CanvasRowHoverGroup } from "@/components/canvas/canvas-row-shell.tsx";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";
import { setCanvasRowDragImage } from "@/lib/canvas/drag-ghost.ts";
import type { Block } from "@/lib/schemas/block.ts";

interface RowGutterProps {
  hideWhenDescendantRowHovered?: boolean;
  hoverGroup?: CanvasRowHoverGroup;
  onInsert?: (edge: "before" | "after") => void;
  row: CanvasRow;
}

function turnIntoValueFromBlock(block: Block): string | undefined {
  if (block.type === "heading") {
    return `heading-${block.props.level}`;
  }
  if (
    block.type === "text" ||
    block.type === "quote" ||
    block.type === "callout"
  ) {
    return block.type;
  }
  return;
}

function canTurnIntoBlock(row: CanvasRow): boolean {
  const { type } = row.effectiveBlock;
  return (
    type === "text" ||
    type === "heading" ||
    type === "quote" ||
    type === "callout"
  );
}

export function RowGutter({
  row,
  onInsert,
  hoverGroup,
  hideWhenDescendantRowHovered,
}: RowGutterProps) {
  const {
    isRowSelected,
    toggleRowSelection,
    selectRow,
    clearSelection,
    setDraggingRowId,
    insertAfter,
    insertBefore,
    dispatch,
    deleteRow,
    duplicateRow,
  } = useCanvasEditorContext();

  return (
    <BlockGutter
      canTurnInto={canTurnIntoBlock(row)}
      hideWhenDescendantRowHovered={hideWhenDescendantRowHovered}
      hoverGroup={hoverGroup}
      isSelected={isRowSelected(row.rowId)}
      onConvert={(item) => {
        applyBlockConversion(row, item, dispatch);
        dispatch({ type: "focus.set", rowId: row.rowId, placement: "start" });
      }}
      onDelete={() => deleteRow(row.rowId)}
      onDragEnd={() => setDraggingRowId(null)}
      onDragInteractionStart={() => clearSelection()}
      onDragStart={(event) => {
        setDraggingRowId(row.rowId);
        setCanvasRowDragImage(event.nativeEvent, row.rowId);
      }}
      onDuplicate={() => duplicateRow(row.rowId)}
      onInsert={
        onInsert ??
        ((edge) =>
          edge === "before" ? insertBefore(row.rowId) : insertAfter(row.rowId))
      }
      onMenuOpen={() => selectRow(row.rowId)}
      onSelect={(event) => {
        toggleRowSelection(row.rowId, {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey || event.ctrlKey,
        });
      }}
      rowId={row.rowId}
      turnIntoValue={turnIntoValueFromBlock(row.effectiveBlock)}
    />
  );
}
