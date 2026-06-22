/** Merges bounding boxes from every cell in a column into one full-height strip. */
export function collectTableColumnDropRects(): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  if (typeof document === "undefined") {
    return map;
  }

  for (const layout of document.querySelectorAll("[data-table-layout]")) {
    const tableId = layout.getAttribute("data-table-id");
    if (!tableId) {
      continue;
    }

    const table = layout.querySelector("table");
    if (!(table instanceof HTMLElement)) {
      continue;
    }

    const tableRect = table.getBoundingClientRect();
    const boundsByColumn = new Map<
      number,
      { bottom: number; left: number; right: number; top: number }
    >();

    for (const cell of table.querySelectorAll<HTMLElement>(
      "[data-table-column-index]"
    )) {
      const indexValue = cell.getAttribute("data-table-column-index");
      if (indexValue == null) {
        continue;
      }
      const columnIndex = Number.parseInt(indexValue, 10);
      if (Number.isNaN(columnIndex)) {
        continue;
      }

      const rect = cell.getBoundingClientRect();
      const existing = boundsByColumn.get(columnIndex);
      if (!existing) {
        boundsByColumn.set(columnIndex, {
          top: rect.top,
          left: rect.left,
          bottom: rect.bottom,
          right: rect.right,
        });
        continue;
      }

      existing.top = Math.min(existing.top, rect.top);
      existing.left = Math.min(existing.left, rect.left);
      existing.bottom = Math.max(existing.bottom, rect.bottom);
      existing.right = Math.max(existing.right, rect.right);
    }

    for (const [columnIndex, bounds] of boundsByColumn) {
      map.set(
        `${tableId}:${columnIndex}`,
        toDomRect({
          top: tableRect.top,
          left: bounds.left,
          bottom: tableRect.bottom,
          right: bounds.right,
        })
      );
    }
  }

  return map;
}

function toDomRect(bounds: {
  bottom: number;
  left: number;
  right: number;
  top: number;
}): DOMRect {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  return {
    top: bounds.top,
    left: bounds.left,
    bottom: bounds.bottom,
    right: bounds.right,
    width,
    height,
    x: bounds.left,
    y: bounds.top,
    toJSON: () => ({}),
  } as DOMRect;
}
