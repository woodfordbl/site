import { CANVAS_ROW_ATTRIBUTE } from "@/lib/canvas/resolve-drop-target.ts";
import { TABLE_ROW_ATTRIBUTE } from "@/lib/canvas/resolve-table-drop-target.ts";

/** Resolves the DOM node cloned as the native drag image for a canvas row drag. */
export function resolveCanvasRowDragPreviewNode(
  rowId: string
): HTMLElement | null {
  const escapedId = CSS.escape(rowId);

  // Table blocks sit in a full-width content column but the grid itself is only
  // as wide as its columns. Clone the `<table>` (scoped by data-table-id, which
  // equals this row's id) so the preview keeps the table's real size rather than
  // ballooning to the content width. data-table-id avoids matching a *nested*
  // table when a container row is dragged.
  const tableGrid = document.querySelector(
    `[data-table-id="${escapedId}"] table`
  );
  if (tableGrid instanceof HTMLElement) {
    return tableGrid;
  }

  const canvasContent = document.querySelector(
    `[${CANVAS_ROW_ATTRIBUTE}="${escapedId}"] [data-canvas-row-content]`
  );
  if (canvasContent instanceof HTMLElement) {
    return canvasContent;
  }

  const tableRow = document.querySelector(
    `[${TABLE_ROW_ATTRIBUTE}="${escapedId}"]`
  );
  return tableRow instanceof HTMLElement ? tableRow : null;
}
