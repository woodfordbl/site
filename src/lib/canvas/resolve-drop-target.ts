import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { flattenRows } from "@/db/queries/merge-blocks.ts";

export interface DropTarget {
  edge: "before" | "after";
  rowId: string;
}

export function normalizeDropTarget(
  rows: CanvasRow[],
  rowId: string,
  edge: "before" | "after"
): DropTarget {
  if (edge === "before") {
    return { rowId, edge: "before" };
  }

  const ordered = flattenRows(rows);
  const index = ordered.findIndex((row) => row.rowId === rowId);
  const nextRow = index >= 0 ? ordered[index + 1] : undefined;

  if (nextRow) {
    return { rowId: nextRow.rowId, edge: "before" };
  }

  return { rowId, edge: "after" };
}

function resolveDropEdge(clientY: number, rect: DOMRect): "before" | "after" {
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

export function collectCanvasRowRects(): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  for (const element of document.querySelectorAll("[data-canvas-row-id]")) {
    const rowId = element.getAttribute("data-canvas-row-id");
    if (rowId) {
      map.set(rowId, element.getBoundingClientRect());
    }
  }
  return map;
}

export function resolveDropTargetFromPointer(
  rows: CanvasRow[],
  clientY: number,
  rowRects: Map<string, DOMRect>,
  draggingRowId: string | null
): DropTarget | null {
  if (!draggingRowId || rows.length === 0) {
    return null;
  }

  const firstTopLevel = rows[0];
  const lastTopLevel = rows.at(-1);
  if (!(firstTopLevel && lastTopLevel)) {
    return null;
  }

  const firstRect = rowRects.get(firstTopLevel.rowId);
  const lastRect = rowRects.get(lastTopLevel.rowId);

  if (firstRect && clientY < firstRect.top) {
    return { rowId: firstTopLevel.rowId, edge: "before" };
  }

  if (lastRect && clientY > lastRect.bottom) {
    return { rowId: lastTopLevel.rowId, edge: "after" };
  }

  const ordered = flattenRows(rows);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const row = ordered[index];
    if (!row) {
      continue;
    }

    const rect = rowRects.get(row.rowId);
    if (!rect) {
      continue;
    }

    if (clientY < rect.top || clientY > rect.bottom) {
      continue;
    }

    if (row.rowId === draggingRowId) {
      return null;
    }

    const rawEdge = resolveDropEdge(clientY, rect);
    return normalizeDropTarget(rows, row.rowId, rawEdge);
  }

  return null;
}
