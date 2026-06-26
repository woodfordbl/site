import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowById } from "@/lib/blocks/block-tree.ts";
import { resolveColumnRowAtY } from "@/lib/canvas/resolve-column-row-at-y.ts";
import { collectCanvasRowRects } from "@/lib/canvas/resolve-drop-target.ts";

/** Resolve which top-level row to select from pointer Y (page-level overclick). */
export function resolveTopLevelOverclickRow(
  rows: CanvasRow[],
  clientY: number,
  rowRects: Map<string, DOMRect>
): string | null {
  const first = rows[0];
  const last = rows.at(-1);
  if (!(first && last)) {
    return null;
  }

  const lastRect = rowRects.get(last.rowId);
  if (lastRect && clientY > lastRect.bottom) {
    return last.rowId;
  }

  for (const row of rows) {
    const rect = rowRects.get(row.rowId);
    if (rect && clientY >= rect.top && clientY <= rect.bottom) {
      return row.rowId;
    }
  }

  return null;
}

function resolveColumnsLayoutOverclick(
  rows: CanvasRow[],
  clientX: number,
  clientY: number,
  rowRects: Map<string, DOMRect>
): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  for (const layout of document.querySelectorAll("[data-columns-layout]")) {
    const layoutRect = layout.getBoundingClientRect();
    if (
      clientY < layoutRect.top ||
      clientY > layoutRect.bottom ||
      clientX < layoutRect.left ||
      clientX > layoutRect.right
    ) {
      continue;
    }

    for (const columnEl of layout.querySelectorAll("[data-column-id]")) {
      const columnId = columnEl.getAttribute("data-column-id");
      if (!columnId) {
        continue;
      }
      const colRect = columnEl.getBoundingClientRect();
      if (
        clientX < colRect.left ||
        clientX > colRect.right ||
        clientY < colRect.top ||
        clientY > colRect.bottom
      ) {
        continue;
      }

      const columnRow = findRowById(rows, columnId);
      if (columnRow?.effectiveBlock.type !== "column") {
        continue;
      }

      const rowId = resolveColumnRowAtY(columnRow, clientY, rowRects);
      if (rowId) {
        return rowId;
      }
    }
  }

  return null;
}

/**
 * Resolve which canvas row to focus when the user clicks empty space below
 * block content, inside a stretched column, or at the page bottom.
 */
export function resolveOverclickRowFromPointer(
  rows: CanvasRow[],
  clientX: number,
  clientY: number,
  rowRects: Map<string, DOMRect> = collectCanvasRowRects()
): string | null {
  if (rows.length === 0) {
    return null;
  }

  const columnsRow = resolveColumnsLayoutOverclick(
    rows,
    clientX,
    clientY,
    rowRects
  );
  if (columnsRow) {
    return columnsRow;
  }

  return resolveTopLevelOverclickRow(rows, clientY, rowRects);
}
