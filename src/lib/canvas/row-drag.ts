export const CANVAS_ROW_DRAG_TYPE = "application/x-canvas-row-id";

export function setCanvasRowDragData(
  dataTransfer: DataTransfer,
  rowId: string
): void {
  dataTransfer.setData(CANVAS_ROW_DRAG_TYPE, rowId);
  dataTransfer.effectAllowed = "move";
}

export function getCanvasRowDragId(dataTransfer: DataTransfer): string | null {
  const rowId = dataTransfer.getData(CANVAS_ROW_DRAG_TYPE);
  return rowId.length > 0 ? rowId : null;
}
