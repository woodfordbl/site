import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { expandListContainerSelection } from "@/lib/canvas/block-selection.ts";

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

/**
 * Top-level rows whose shell rects intersect the marquee, in document order.
 * A top-level shell rect covers its whole subtree, so touching any nested row
 * selects the top-level block (Notion-style). List containers expand to their
 * child rows so the result matches click selection.
 */
export function rowIdsIntersectingMarquee(
  rows: CanvasRow[],
  marquee: MarqueeRect,
  rowRects: ReadonlyMap<string, DOMRect>
): string[] {
  const selected: string[] = [];
  for (const row of rows) {
    const rect = rowRects.get(row.rowId);
    if (rect && marqueeIntersectsRect(marquee, rect)) {
      selected.push(...expandListContainerSelection(rows, row.rowId));
    }
  }
  return selected;
}
