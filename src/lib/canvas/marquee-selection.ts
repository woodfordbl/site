import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { expandUnitContainerSelection } from "@/lib/canvas/block-selection.ts";
import { rowContentScopes } from "@/lib/canvas/canvas-scopes.ts";

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
    for (const scope of rowContentScopes(row, scopeRects)) {
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
      selected.push(...expandUnitContainerSelection(scopeRows, row.rowId));
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
