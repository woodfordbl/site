import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowContext, flattenRows } from "@/lib/blocks/block-tree.ts";
import {
  type DropTarget,
  normalizeDropTarget,
} from "@/lib/canvas/drop-target.ts";

/** Attribute marking table rows for in-table drop hit-testing. */
export const TABLE_ROW_ATTRIBUTE = "data-table-row-id";

function rectContainsPoint(
  rect: DOMRect,
  clientX: number,
  clientY: number
): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function resolveDropEdge(clientY: number, rect: DOMRect): "before" | "after" {
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function isRowDescendantOf(
  rows: CanvasRow[],
  candidateRowId: string,
  ancestorRowId: string
): boolean {
  const ancestor = flattenRows(rows).find((row) => row.rowId === ancestorRowId);
  if (!ancestor) {
    return false;
  }
  for (const nested of flattenRows([ancestor])) {
    if (nested.rowId === candidateRowId) {
      return true;
    }
  }
  return false;
}

function collectTableRowRects(layout: Element): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  const table = layout.querySelector("table");
  const tableRect =
    table instanceof HTMLElement ? table.getBoundingClientRect() : null;

  for (const element of layout.querySelectorAll(`[${TABLE_ROW_ATTRIBUTE}]`)) {
    const rowId = element.getAttribute(TABLE_ROW_ATTRIBUTE);
    if (!rowId) {
      continue;
    }

    const rowRect = element.getBoundingClientRect();
    if (tableRect) {
      rects.set(
        rowId,
        toTableRowDropRect({
          left: tableRect.left,
          right: tableRect.right,
          top: rowRect.top,
          bottom: rowRect.bottom,
        })
      );
      continue;
    }

    rects.set(rowId, rowRect);
  }
  return rects;
}

function toTableRowDropRect(bounds: {
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

function resolveTableRowDropTarget(
  rows: CanvasRow[],
  tableRow: CanvasRow,
  rect: DOMRect,
  clientX: number,
  clientY: number,
  draggingRowId: string
): DropTarget | null {
  if (!rectContainsPoint(rect, clientX, clientY)) {
    return null;
  }

  if (tableRow.rowId === draggingRowId) {
    return null;
  }

  if (isRowDescendantOf(rows, draggingRowId, tableRow.rowId)) {
    return null;
  }

  return normalizeDropTarget(
    rows,
    tableRow.rowId,
    resolveDropEdge(clientY, rect)
  );
}

function resolveTableLayoutInElement(
  rows: CanvasRow[],
  layout: Element,
  clientX: number,
  clientY: number,
  draggingRowId: string
): DropTarget | null {
  const tableId = layout.getAttribute("data-table-id");
  if (!tableId) {
    return null;
  }

  const tableCtx = findRowContext(rows, tableId);
  if (!tableCtx || tableCtx.row.effectiveBlock.type !== "table") {
    return null;
  }

  const tableBlock = tableCtx.row.effectiveBlock;
  const tableRowRects = collectTableRowRects(layout);
  const tableRows = tableCtx.row.children.filter(
    (child) => child.effectiveBlock.type === "tableRow"
  );

  for (let index = tableRows.length - 1; index >= 0; index -= 1) {
    const tableRow = tableRows[index];
    if (!tableRow) {
      continue;
    }

    if (tableBlock.props.hasHeaderRow && index === 0) {
      continue;
    }

    const rect = tableRowRects.get(tableRow.rowId);
    if (!rect) {
      continue;
    }

    const target = resolveTableRowDropTarget(
      rows,
      tableRow,
      rect,
      clientX,
      clientY,
      draggingRowId
    );
    if (target) {
      return target;
    }
  }

  return null;
}

/** Resolve row reorder drops when the pointer is inside a table layout. */
export function resolveTableLayoutDrop(
  rows: CanvasRow[],
  clientX: number,
  clientY: number,
  draggingRowId: string
): DropTarget | null {
  if (typeof document === "undefined") {
    return null;
  }

  const layouts = document.querySelectorAll("[data-table-layout]");
  for (const layout of layouts) {
    const layoutRect = layout.getBoundingClientRect();
    if (
      clientY < layoutRect.top ||
      clientY > layoutRect.bottom ||
      clientX < layoutRect.left ||
      clientX > layoutRect.right
    ) {
      continue;
    }

    const target = resolveTableLayoutInElement(
      rows,
      layout,
      clientX,
      clientY,
      draggingRowId
    );
    if (target) {
      return target;
    }
  }

  return null;
}
