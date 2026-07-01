import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { expandListContainerSelection } from "@/lib/canvas/block-selection.ts";
import { collectRects } from "@/lib/dnd/rects.ts";

/** Marquee rectangle in viewport coordinates (getBoundingClientRect space). */
export interface MarqueeRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface MarqueePoint {
  x: number;
  y: number;
}

/**
 * Marks the content wrapper of a drillable container scope (column, tab,
 * callout, toggle heading), valued with the owning row id. Only mounted scopes
 * exist in the DOM — collapsed toggles and inactive tabs unmount their
 * children, so absence from this collection means the scope is not visible.
 */
export const CANVAS_SCOPE_ATTRIBUTE = "data-canvas-scope";

export function collectCanvasScopeRects(): Map<string, DOMRect> {
  return collectRects(CANVAS_SCOPE_ATTRIBUTE);
}

export function marqueeRectFromPoints(
  start: MarqueePoint,
  end: MarqueePoint
): MarqueeRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  };
}

export function marqueeIntersectsRect(
  marquee: MarqueeRect,
  rect: Pick<DOMRect, "bottom" | "left" | "right" | "top">
): boolean {
  return (
    marquee.left <= rect.right &&
    marquee.left + marquee.width >= rect.left &&
    marquee.top <= rect.bottom &&
    marquee.top + marquee.height >= rect.top
  );
}

function rectContainsMarquee(
  rect: Pick<DOMRect, "bottom" | "left" | "right" | "top">,
  marquee: MarqueeRect
): boolean {
  return (
    marquee.left >= rect.left &&
    marquee.left + marquee.width <= rect.right &&
    marquee.top >= rect.top &&
    marquee.top + marquee.height <= rect.bottom
  );
}

interface DrillScope {
  children: CanvasRow[];
  rect: DOMRect;
}

/**
 * Content scopes the marquee may drill into for a container row. Columns and
 * tabs drill per structural child — `column`/`tab` rows render no shell of
 * their own, so their content rect is the only geometry they have. Callouts
 * and toggle headings drill into their single content area (which excludes the
 * heading/icon chrome, so a marquee over the chrome selects the container
 * whole). Missing rects mean the scope is unmounted (collapsed, inactive tab).
 */
function drillScopes(
  row: CanvasRow,
  scopeRects: ReadonlyMap<string, DOMRect>
): DrillScope[] {
  switch (row.effectiveBlock.type) {
    case "columns":
    case "tabs":
      return row.children.flatMap((child) => {
        const rect = scopeRects.get(child.rowId);
        return rect ? [{ children: child.children, rect }] : [];
      });
    case "callout":
    case "toggleHeading": {
      const rect = scopeRects.get(row.rowId);
      return rect ? [{ children: row.children, rect }] : [];
    }
    default:
      return [];
  }
}

function selectInScope(
  scopeRows: CanvasRow[],
  marquee: MarqueeRect,
  rowRects: ReadonlyMap<string, DOMRect>,
  scopeRects: ReadonlyMap<string, DOMRect>
): string[] {
  // Drill: when the marquee sits fully inside one container's content area,
  // selection happens in that scope (Notion-style). Sibling content rects
  // never overlap, so the first containing scope is the only one.
  for (const row of scopeRows) {
    for (const scope of drillScopes(row, scopeRects)) {
      if (rectContainsMarquee(scope.rect, marquee)) {
        return selectInScope(scope.children, marquee, rowRects, scopeRects);
      }
    }
  }

  // Otherwise rows in this scope select atomically — a marquee that crosses a
  // container's boundary takes the whole container. List containers expand to
  // their child rows so the result matches click selection. Rows without a
  // rect are unmounted (hidden) and skipped.
  const selected: string[] = [];
  for (const row of scopeRows) {
    const rect = rowRects.get(row.rowId);
    if (rect && marqueeIntersectsRect(marquee, rect)) {
      selected.push(...expandListContainerSelection(scopeRows, row.rowId));
    }
  }
  return selected;
}

/**
 * Rows selected by the marquee, in document order. Selection resolves at the
 * deepest container scope whose content area fully contains the marquee, so a
 * drag inside one column/tab/callout/toggle selects that scope's rows, while a
 * drag that spans a container boundary selects containers whole.
 */
export function rowIdsIntersectingMarquee(
  rows: CanvasRow[],
  marquee: MarqueeRect,
  rowRects: ReadonlyMap<string, DOMRect>,
  scopeRects: ReadonlyMap<string, DOMRect>
): string[] {
  return selectInScope(rows, marquee, rowRects, scopeRects);
}
