import { CANVAS_ROW_ATTRIBUTE } from "@/lib/canvas/resolve-drop-target.ts";
import { TABLE_ROW_ATTRIBUTE } from "@/lib/canvas/resolve-table-drop-target.ts";

/** Resolves the DOM node cloned as the native drag image for a canvas row drag. */
export function resolveCanvasRowDragPreviewNode(
  rowId: string
): HTMLElement | null {
  const canvasContent = document.querySelector(
    `[${CANVAS_ROW_ATTRIBUTE}="${CSS.escape(rowId)}"] [data-canvas-row-content]`
  );
  if (canvasContent instanceof HTMLElement) {
    return canvasContent;
  }

  const tableRow = document.querySelector(
    `[${TABLE_ROW_ATTRIBUTE}="${CSS.escape(rowId)}"]`
  );
  return tableRow instanceof HTMLElement ? tableRow : null;
}
