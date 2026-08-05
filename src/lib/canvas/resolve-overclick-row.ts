import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowById } from "@/lib/blocks/block-tree.ts";
import { selectsChildrenAsUnit } from "@/lib/canvas/block-container-config.ts";
import {
  type CanvasContentScope,
  collectCanvasScopeRects,
  rowContentScopes,
} from "@/lib/canvas/canvas-scopes.ts";
import { isFocusableCanvasRow } from "@/lib/canvas/focusable-rows.ts";
import { resolveScopeRowAtY } from "@/lib/canvas/resolve-column-row-at-y.ts";
import { collectCanvasRowRects } from "@/lib/canvas/resolve-drop-target.ts";

/** Depth-first last focusable leaf under `row` (list/checklist items, nested scopes). */
function lastFocusableDescendantId(row: CanvasRow): string | null {
  for (let index = row.children.length - 1; index >= 0; index -= 1) {
    const child = row.children[index];
    if (!child) {
      continue;
    }
    if (isFocusableCanvasRow(child)) {
      return child.rowId;
    }
    const nested = lastFocusableDescendantId(child);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function hasMountedChildRect(
  row: CanvasRow,
  rowRects: ReadonlyMap<string, DOMRect>
): boolean {
  return row.children.some((child) => rowRects.has(child.rowId));
}

/**
 * Map a resolved overclick candidate to a focusable leaf. Unit containers
 * (list/checklist) never take a caret — pick the child at Y, or the last
 * focusable descendant when the pointer is below every child. Other containers
 * may own chrome fields (toggle heading); keep them unless the click is below
 * the container and children are mounted.
 */
export function resolveFocusableOverclickRow(
  rows: CanvasRow[],
  rowId: string,
  clientY: number,
  rowRects: ReadonlyMap<string, DOMRect>
): string | null {
  const row = findRowById(rows, rowId);
  if (!row) {
    return null;
  }
  if (isFocusableCanvasRow(row)) {
    return row.rowId;
  }

  const type = row.effectiveBlock.type;
  const rowRect = rowRects.get(row.rowId);
  const belowContainer = rowRect != null && clientY > rowRect.bottom;
  const unitContainer = selectsChildrenAsUnit(type);
  const childrenMounted = hasMountedChildRect(row, rowRects);

  if (!(unitContainer || (belowContainer && childrenMounted))) {
    return row.rowId;
  }

  const childId = resolveScopeRowAtY(row.children, clientY, rowRects);
  if (childId && (unitContainer || rowRects.has(childId))) {
    return resolveFocusableOverclickRow(rows, childId, clientY, rowRects);
  }

  return lastFocusableDescendantId(row) ?? row.rowId;
}

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

function rectContainsPoint(
  rect: Pick<DOMRect, "bottom" | "left" | "right" | "top">,
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

/**
 * Scope under the pointer. Exact containment wins; otherwise a pointer inside
 * the container row but between scopes (column gutters, callout padding)
 * resolves to the horizontally nearest scope whose vertical band contains it.
 */
function scopeAtPoint(
  scopes: CanvasContentScope[],
  rowRect: DOMRect | undefined,
  clientX: number,
  clientY: number
): CanvasContentScope | null {
  const exact = scopes.find((scope) =>
    rectContainsPoint(scope.rect, clientX, clientY)
  );
  if (exact) {
    return exact;
  }

  if (!(rowRect && rectContainsPoint(rowRect, clientX, clientY))) {
    return null;
  }

  let best: CanvasContentScope | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const scope of scopes) {
    if (clientY < scope.rect.top || clientY > scope.rect.bottom) {
      continue;
    }
    const distance = Math.max(
      scope.rect.left - clientX,
      clientX - scope.rect.right,
      0
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = scope;
    }
  }
  return best;
}

/**
 * Route the pointer into the deepest content scope containing it (columns,
 * tabs, callouts, expanded toggles — anything declaring `scopedContent`), then
 * resolve the row at Y within that scope.
 */
function resolveScopedOverclick(
  scopeRows: CanvasRow[],
  clientX: number,
  clientY: number,
  rowRects: Map<string, DOMRect>,
  scopeRects: ReadonlyMap<string, DOMRect>
): string | null {
  for (const row of scopeRows) {
    const scopes = rowContentScopes(row, scopeRects);
    if (scopes.length === 0) {
      continue;
    }
    const scope = scopeAtPoint(
      scopes,
      rowRects.get(row.rowId),
      clientX,
      clientY
    );
    if (!scope) {
      continue;
    }
    return (
      resolveScopedOverclick(
        scope.children,
        clientX,
        clientY,
        rowRects,
        scopeRects
      ) ?? resolveScopeRowAtY(scope.children, clientY, rowRects)
    );
  }
  return null;
}

/**
 * Resolve which canvas row to focus when the user clicks empty space below
 * block content, inside container dead space, or at the page bottom.
 */
export function resolveOverclickRowFromPointer(
  rows: CanvasRow[],
  clientX: number,
  clientY: number,
  rowRects: Map<string, DOMRect> = collectCanvasRowRects(),
  scopeRects: ReadonlyMap<string, DOMRect> = collectCanvasScopeRects()
): string | null {
  if (rows.length === 0) {
    return null;
  }

  const scopedRow = resolveScopedOverclick(
    rows,
    clientX,
    clientY,
    rowRects,
    scopeRects
  );
  const candidate =
    scopedRow ?? resolveTopLevelOverclickRow(rows, clientY, rowRects);
  if (!candidate) {
    return null;
  }

  return resolveFocusableOverclickRow(rows, candidate, clientY, rowRects);
}
