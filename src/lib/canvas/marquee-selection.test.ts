import { describe, expect, it } from "vitest";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import {
  marqueeIntersectsRect,
  marqueeRectFromPoints,
  rowIdsIntersectingMarquee,
} from "@/lib/canvas/marquee-selection.ts";

function row(rowId: string, children: CanvasRow[] = []): CanvasRow {
  return {
    rowId,
    effectiveBlock: {
      id: rowId,
      type: "text",
      props: { text: rowId },
    },
    children,
  };
}

function listRow(rowId: string, children: CanvasRow[]): CanvasRow {
  return {
    rowId,
    effectiveBlock: {
      id: rowId,
      type: "list",
      props: { variant: "bullet" },
    },
    children,
  };
}

function rect(top: number, height: number, left = 0, width = 100): DOMRect {
  return {
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("marqueeRectFromPoints", () => {
  it("normalizes points dragged in any direction", () => {
    expect(marqueeRectFromPoints({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({
      left: 10,
      top: 20,
      width: 40,
      height: 60,
    });
  });
});

describe("marqueeIntersectsRect", () => {
  const marquee = { left: 10, top: 10, width: 30, height: 30 };

  it("intersects overlapping rects", () => {
    expect(marqueeIntersectsRect(marquee, rect(30, 40, 30, 40))).toBe(true);
  });

  it("intersects when the marquee only touches an edge", () => {
    expect(marqueeIntersectsRect(marquee, rect(40, 20, 0, 100))).toBe(true);
  });

  it("misses rects fully outside", () => {
    expect(marqueeIntersectsRect(marquee, rect(50, 20, 0, 100))).toBe(false);
    expect(marqueeIntersectsRect(marquee, rect(0, 100, 50, 20))).toBe(false);
  });
});

describe("rowIdsIntersectingMarquee", () => {
  const rows = [row("a"), row("b"), row("c")];
  const rects = new Map<string, DOMRect>([
    ["a", rect(100, 40)],
    ["b", rect(150, 40)],
    ["c", rect(200, 40)],
  ]);

  it("selects the rows the marquee spans, in document order", () => {
    const marquee = { left: 10, top: 130, width: 20, height: 60 };
    expect(rowIdsIntersectingMarquee(rows, marquee, rects)).toEqual(["a", "b"]);
  });

  it("selects nothing when the marquee misses every row", () => {
    const marquee = { left: 200, top: 0, width: 20, height: 400 };
    expect(rowIdsIntersectingMarquee(rows, marquee, rects)).toEqual([]);
  });

  it("skips rows without a measured rect", () => {
    const marquee = { left: 10, top: 0, width: 20, height: 400 };
    expect(
      rowIdsIntersectingMarquee([...rows, row("hidden")], marquee, rects)
    ).toEqual(["a", "b", "c"]);
  });

  it("expands list containers to their child rows", () => {
    const withList = [row("a"), listRow("list", [row("l1"), row("l2")])];
    const listRects = new Map<string, DOMRect>([
      ["a", rect(100, 40)],
      ["list", rect(150, 80)],
      ["l1", rect(150, 40)],
      ["l2", rect(190, 40)],
    ]);
    const marquee = { left: 10, top: 120, width: 20, height: 50 };
    expect(rowIdsIntersectingMarquee(withList, marquee, listRects)).toEqual([
      "a",
      "l1",
      "l2",
    ]);
  });
});
