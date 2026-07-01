import { describe, expect, it } from "vitest";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import {
  type MarqueeRect,
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

function containerRow(
  rowId: string,
  type: "callout" | "column" | "columns" | "tab" | "tabs",
  children: CanvasRow[]
): CanvasRow {
  return {
    rowId,
    effectiveBlock: { id: rowId, type, props: {} },
    children,
  } as CanvasRow;
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

function toggleRow(rowId: string, children: CanvasRow[]): CanvasRow {
  return {
    rowId,
    effectiveBlock: {
      id: rowId,
      type: "toggleHeading",
      props: { level: 2, text: rowId },
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

function marquee(
  top: number,
  height: number,
  left = 10,
  width = 20
): MarqueeRect {
  return { top, height, left, width };
}

const NO_SCOPES = new Map<string, DOMRect>();

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
  const box = { left: 10, top: 10, width: 30, height: 30 };

  it("intersects overlapping rects", () => {
    expect(marqueeIntersectsRect(box, rect(30, 40, 30, 40))).toBe(true);
  });

  it("intersects when the marquee only touches an edge", () => {
    expect(marqueeIntersectsRect(box, rect(40, 20, 0, 100))).toBe(true);
  });

  it("misses rects fully outside", () => {
    expect(marqueeIntersectsRect(box, rect(50, 20, 0, 100))).toBe(false);
    expect(marqueeIntersectsRect(box, rect(0, 100, 50, 20))).toBe(false);
  });
});

describe("rowIdsIntersectingMarquee — flat scope", () => {
  const rows = [row("a"), row("b"), row("c")];
  const rects = new Map<string, DOMRect>([
    ["a", rect(100, 40)],
    ["b", rect(150, 40)],
    ["c", rect(200, 40)],
  ]);

  it("selects the rows the marquee spans, in document order", () => {
    expect(
      rowIdsIntersectingMarquee(rows, marquee(130, 60), rects, NO_SCOPES)
    ).toEqual(["a", "b"]);
  });

  it("selects nothing when the marquee misses every row", () => {
    expect(
      rowIdsIntersectingMarquee(rows, marquee(0, 400, 200), rects, NO_SCOPES)
    ).toEqual([]);
  });

  it("skips rows without a measured rect", () => {
    expect(
      rowIdsIntersectingMarquee(
        [...rows, row("hidden")],
        marquee(0, 400),
        rects,
        NO_SCOPES
      )
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
    expect(
      rowIdsIntersectingMarquee(
        withList,
        marquee(120, 50),
        listRects,
        NO_SCOPES
      )
    ).toEqual(["a", "l1", "l2"]);
  });
});

describe("rowIdsIntersectingMarquee — container scopes", () => {
  // Two columns side by side: colA children a1/a2 (x 0-200), colB child b1 (x 220-420).
  const columns = containerRow("cols", "columns", [
    containerRow("colA", "column", [row("a1"), row("a2")]),
    containerRow("colB", "column", [row("b1")]),
  ]);
  const rows = [row("top"), columns];
  const rowRects = new Map<string, DOMRect>([
    ["top", rect(0, 40, 0, 420)],
    ["cols", rect(50, 200, 0, 420)],
    ["a1", rect(50, 40, 0, 200)],
    ["a2", rect(100, 40, 0, 200)],
    ["b1", rect(50, 40, 220, 200)],
  ]);
  const scopeRects = new Map<string, DOMRect>([
    ["colA", rect(50, 200, 0, 200)],
    ["colB", rect(50, 200, 220, 200)],
  ]);

  it("drills into a single column and selects only touched children", () => {
    // Fully inside column A, spanning a1 and a2.
    const inColumnA = marquee(60, 80, 10, 20);
    expect(
      rowIdsIntersectingMarquee(rows, inColumnA, rowRects, scopeRects)
    ).toEqual(["a1", "a2"]);
  });

  it("selects the whole columns block when the marquee spans columns", () => {
    // Inside the columns block but crossing both columns.
    const acrossColumns = marquee(60, 40, 150, 150);
    expect(
      rowIdsIntersectingMarquee(rows, acrossColumns, rowRects, scopeRects)
    ).toEqual(["cols"]);
  });

  it("selects containers whole when the marquee crosses their boundary", () => {
    // From the top-level row into column A's area.
    const acrossBoundary = marquee(20, 100, 10, 20);
    expect(
      rowIdsIntersectingMarquee(rows, acrossBoundary, rowRects, scopeRects)
    ).toEqual(["top", "cols"]);
  });

  it("drills into callout content and selects touched children", () => {
    const callout = containerRow("call", "callout", [row("c1"), row("c2")]);
    const calloutRows = [callout];
    const calloutRowRects = new Map<string, DOMRect>([
      ["call", rect(0, 120, 0, 400)],
      ["c1", rect(10, 40, 40, 350)],
      ["c2", rect(60, 40, 40, 350)],
    ]);
    const calloutScopes = new Map<string, DOMRect>([
      ["call", rect(10, 100, 40, 350)],
    ]);
    expect(
      rowIdsIntersectingMarquee(
        calloutRows,
        marquee(15, 20, 50, 30),
        calloutRowRects,
        calloutScopes
      )
    ).toEqual(["c1"]);
  });

  it("selects a toggle whole when the marquee covers its heading chrome", () => {
    const toggle = toggleRow("tog", [row("t1")]);
    const toggleRowRects = new Map<string, DOMRect>([
      ["tog", rect(0, 100, 0, 400)],
      ["t1", rect(40, 40, 0, 400)],
    ]);
    // Content scope starts below the heading (y 40).
    const toggleScopes = new Map<string, DOMRect>([
      ["tog", rect(40, 60, 0, 400)],
    ]);
    // Over the heading region only — not contained in the content scope.
    expect(
      rowIdsIntersectingMarquee(
        [toggle],
        marquee(5, 20),
        toggleRowRects,
        toggleScopes
      )
    ).toEqual(["tog"]);
    // Fully inside the content area — drills to the child.
    expect(
      rowIdsIntersectingMarquee(
        [toggle],
        marquee(45, 20),
        toggleRowRects,
        toggleScopes
      )
    ).toEqual(["t1"]);
  });

  it("treats a collapsed toggle atomically (no mounted scope)", () => {
    const toggle = toggleRow("tog", [row("t1")]);
    const collapsedRects = new Map<string, DOMRect>([["tog", rect(0, 40)]]);
    expect(
      rowIdsIntersectingMarquee(
        [toggle],
        marquee(10, 20),
        collapsedRects,
        NO_SCOPES
      )
    ).toEqual(["tog"]);
  });

  it("drills only into the active (mounted) tab", () => {
    const tabs = containerRow("tabs", "tabs", [
      containerRow("tabA", "tab", [row("ta1")]),
      containerRow("tabB", "tab", [row("tb1")]),
    ]);
    const tabRowRects = new Map<string, DOMRect>([
      ["tabs", rect(0, 200, 0, 400)],
      ["ta1", rect(50, 40, 0, 400)],
      // tb1 is unmounted (inactive tab) — no rect.
    ]);
    const tabScopes = new Map<string, DOMRect>([
      ["tabA", rect(40, 160, 0, 400)],
    ]);
    expect(
      rowIdsIntersectingMarquee([tabs], marquee(45, 60), tabRowRects, tabScopes)
    ).toEqual(["ta1"]);
    // Over the tab strip (above the panel) — tabs block selects whole.
    expect(
      rowIdsIntersectingMarquee([tabs], marquee(5, 60), tabRowRects, tabScopes)
    ).toEqual(["tabs"]);
  });

  it("drills through nested scopes (callout inside a column)", () => {
    const nested = containerRow("cols", "columns", [
      containerRow("colA", "column", [
        containerRow("call", "callout", [row("n1"), row("n2")]),
      ]),
    ]);
    const nestedRowRects = new Map<string, DOMRect>([
      ["cols", rect(0, 300, 0, 400)],
      ["call", rect(10, 200, 0, 200)],
      ["n1", rect(20, 40, 30, 160)],
      ["n2", rect(70, 40, 30, 160)],
    ]);
    const nestedScopes = new Map<string, DOMRect>([
      ["colA", rect(0, 300, 0, 200)],
      ["call", rect(20, 180, 30, 160)],
    ]);
    expect(
      rowIdsIntersectingMarquee(
        [nested],
        marquee(75, 20, 40, 20),
        nestedRowRects,
        nestedScopes
      )
    ).toEqual(["n2"]);
  });
});
