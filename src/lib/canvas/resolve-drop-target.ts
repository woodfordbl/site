import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowById, flattenRows } from "@/lib/blocks/block-tree.ts";
import {
  type DropTarget,
  normalizeDropTarget,
} from "@/lib/canvas/drop-target.ts";
import { resolveTableLayoutDrop } from "@/lib/canvas/resolve-table-drop-target.ts";
import { collectRects } from "@/lib/dnd/rects.ts";

export type { DropTarget } from "@/lib/canvas/drop-target.ts";

/** Attribute marking canvas rows so the DnD surface can snapshot their rects. */
export const CANVAS_ROW_ATTRIBUTE = "data-canvas-row-id";

/** Minimum vertical band (px) for column start/end drop targets. */
const COLUMN_SCOPE_EDGE_PX = 20;

function resolveDropEdge(clientY: number, rect: DOMRect): "before" | "after" {
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function isRowDescendantOf(
  rows: CanvasRow[],
  candidateRowId: string,
  ancestorRowId: string
): boolean {
  const ancestor = findRowById(rows, ancestorRowId);
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

function isColumnDropBlocked(
  rows: CanvasRow[],
  columnRowId: string,
  draggingRowId: string
): boolean {
  return (
    columnRowId === draggingRowId ||
    isRowDescendantOf(rows, draggingRowId, columnRowId)
  );
}

function isContainerShellRow(row: CanvasRow): boolean {
  const type = row.effectiveBlock.type;
  return (
    (type === "column" ||
      type === "columns" ||
      type === "list" ||
      type === "checklist" ||
      type === "table") &&
    row.children.length > 0
  );
}

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

export function collectCanvasRowRects(): Map<string, DOMRect> {
  return collectRects(CANVAS_ROW_ATTRIBUTE);
}

function columnScopeStartTarget(columnRowId: string): DropTarget {
  return { rowId: columnRowId, edge: "before", atScopeStart: true };
}

interface ColumnDropArgs {
  clientY: number;
  draggingRowId: string;
  rowRects: Map<string, DOMRect>;
  rows: CanvasRow[];
}

/** First/last edge bands of a column: scope-start above, append-after below. */
function resolveColumnEdgeBandDrop(
  columnRow: CanvasRow,
  { clientY, draggingRowId, rowRects, rows }: ColumnDropArgs
): { target: DropTarget | null } | null {
  const firstChild = columnRow.children[0];
  const lastChild = columnRow.children.at(-1);
  const firstRect = firstChild ? rowRects.get(firstChild.rowId) : undefined;
  const lastRect = lastChild ? rowRects.get(lastChild.rowId) : undefined;

  if (firstRect && clientY < firstRect.top + COLUMN_SCOPE_EDGE_PX) {
    return { target: columnScopeStartTarget(columnRow.rowId) };
  }

  if (lastRect && clientY > lastRect.bottom - COLUMN_SCOPE_EDGE_PX) {
    if (lastChild && lastChild.rowId !== draggingRowId) {
      return { target: normalizeDropTarget(rows, lastChild.rowId, "after") };
    }
    return { target: null };
  }

  return null;
}

/** Hit-test column children bottom-up (later siblings paint above earlier ones). */
function resolveColumnChildDrop(
  columnRow: CanvasRow,
  { clientY, draggingRowId, rowRects, rows }: ColumnDropArgs
): { target: DropTarget | null } | null {
  const children = columnRow.children;

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    const rect = child ? rowRects.get(child.rowId) : undefined;
    if (!(child && rect)) {
      continue;
    }
    if (clientY < rect.top || clientY > rect.bottom) {
      continue;
    }
    if (child.rowId === draggingRowId) {
      return { target: null };
    }
    return {
      target: normalizeDropTarget(
        rows,
        child.rowId,
        resolveDropEdge(clientY, rect)
      ),
    };
  }

  return null;
}

/** Resolve a drop target inside one column using column-local Y bands and child rows. */
export function resolveColumnContentDrop(
  rows: CanvasRow[],
  columnRowId: string,
  clientY: number,
  rowRects: Map<string, DOMRect>,
  draggingRowId: string
): DropTarget | null {
  const columnRow = findRowById(rows, columnRowId);
  if (!columnRow || columnRow.effectiveBlock.type !== "column") {
    return null;
  }
  if (isColumnDropBlocked(rows, columnRowId, draggingRowId)) {
    return null;
  }

  if (columnRow.children.length === 0) {
    return columnScopeStartTarget(columnRowId);
  }

  const args: ColumnDropArgs = { clientY, draggingRowId, rowRects, rows };

  const bandDrop = resolveColumnEdgeBandDrop(columnRow, args);
  if (bandDrop) {
    return bandDrop.target;
  }

  const childDrop = resolveColumnChildDrop(columnRow, args);
  if (childDrop) {
    return childDrop.target;
  }

  const firstChild = columnRow.children[0];
  const lastChild = columnRow.children.at(-1);
  const firstRect = firstChild ? rowRects.get(firstChild.rowId) : undefined;
  const lastRect = lastChild ? rowRects.get(lastChild.rowId) : undefined;

  if (lastRect && lastChild && clientY > lastRect.bottom) {
    return lastChild.rowId === draggingRowId
      ? null
      : normalizeDropTarget(rows, lastChild.rowId, "after");
  }

  if (firstRect && clientY < firstRect.top) {
    return columnScopeStartTarget(columnRowId);
  }

  return null;
}

function resolveEmptyColumnDrop(
  rows: CanvasRow[],
  columnRowId: string,
  draggingRowId: string
): DropTarget | null {
  const columnRow = findRowById(rows, columnRowId);
  if (!columnRow || columnRow.effectiveBlock.type !== "column") {
    return null;
  }
  if (columnRow.children.length > 0) {
    return null;
  }
  if (isColumnDropBlocked(rows, columnRowId, draggingRowId)) {
    return null;
  }
  return { rowId: columnRowId, edge: "before", atScopeStart: true };
}

/** Column-aware drop resolution when the pointer is inside a columns layout. */
function resolveColumnsLayoutDrop(
  rows: CanvasRow[],
  clientX: number,
  clientY: number,
  rowRects: Map<string, DOMRect>,
  draggingRowId: string
): DropTarget | null {
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

      const contentDrop = resolveColumnContentDrop(
        rows,
        columnId,
        clientY,
        rowRects,
        draggingRowId
      );
      if (contentDrop) {
        return contentDrop;
      }

      const emptyDrop = resolveEmptyColumnDrop(rows, columnId, draggingRowId);
      if (emptyDrop) {
        return emptyDrop;
      }
    }
  }
  return null;
}

/** Drop resolution for a row the pointer is inside (null = invalid drop). */
function resolveRowHitDrop(
  rows: CanvasRow[],
  row: CanvasRow,
  rect: DOMRect,
  clientY: number,
  draggingRowId: string
): DropTarget | null {
  if (row.rowId === draggingRowId) {
    return null;
  }

  if (isRowDescendantOf(rows, draggingRowId, row.rowId)) {
    return null;
  }

  const emptyColumn = resolveEmptyColumnDrop(rows, row.rowId, draggingRowId);
  if (emptyColumn) {
    return emptyColumn;
  }

  return normalizeDropTarget(rows, row.rowId, resolveDropEdge(clientY, rect));
}

function resolveVerticalRowDrop(
  rows: CanvasRow[],
  clientX: number,
  clientY: number,
  rowRects: Map<string, DOMRect>,
  draggingRowId: string
): DropTarget | null {
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
    if (!row || isContainerShellRow(row)) {
      continue;
    }

    const rect = rowRects.get(row.rowId);
    if (!(rect && rectContainsPoint(rect, clientX, clientY))) {
      continue;
    }

    return resolveRowHitDrop(rows, row, rect, clientY, draggingRowId);
  }

  return null;
}

/**
 * Resolve a top-level insert position from a pointer Y — used when dropping an
 * external item (a sidebar page) into the canvas. Top-level only, so the inserted
 * row never lands inside a container (e.g. a text-only table cell). Returns the
 * last row's `after` as a fallback so a drop always lands somewhere.
 */
export function resolveTopLevelInsertEdge(
  rows: CanvasRow[],
  clientY: number,
  rowRects: Map<string, DOMRect>
): { edge: "before" | "after"; rowId: string } | null {
  const first = rows[0];
  const last = rows.at(-1);
  if (!(first && last)) {
    return null;
  }

  const firstRect = rowRects.get(first.rowId);
  if (firstRect && clientY < firstRect.top) {
    return { rowId: first.rowId, edge: "before" };
  }

  for (const row of rows) {
    const rect = rowRects.get(row.rowId);
    if (rect && clientY >= rect.top && clientY <= rect.bottom) {
      return { rowId: row.rowId, edge: resolveDropEdge(clientY, rect) };
    }
  }

  return { rowId: last.rowId, edge: "after" };
}

export function resolveDropTargetFromPointer(
  rows: CanvasRow[],
  clientX: number,
  clientY: number,
  rowRects: Map<string, DOMRect>,
  draggingRowId: string | null
): DropTarget | null {
  if (!draggingRowId || rows.length === 0) {
    return null;
  }

  const tableDrop = resolveTableLayoutDrop(
    rows,
    clientX,
    clientY,
    draggingRowId
  );
  if (tableDrop) {
    return tableDrop;
  }

  const columnsDrop = resolveColumnsLayoutDrop(
    rows,
    clientX,
    clientY,
    rowRects,
    draggingRowId
  );
  if (columnsDrop) {
    return columnsDrop;
  }

  return resolveVerticalRowDrop(
    rows,
    clientX,
    clientY,
    rowRects,
    draggingRowId
  );
}
