import { describe, expect, it } from "vitest";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { resolveColumnRowAtY } from "@/lib/canvas/resolve-column-row-at-y.ts";
import {
  resolveOverclickRowFromPointer,
  resolveTopLevelOverclickRow,
} from "@/lib/canvas/resolve-overclick-row.ts";

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

function columnRow(rowId: string, children: CanvasRow[] = []): CanvasRow {
  return {
    rowId,
    effectiveBlock: {
      id: rowId,
      type: "column",
      props: { width: 1 },
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

describe("resolveTopLevelOverclickRow", () => {
  const rows = [row("a"), row("b"), row("c")];
  const rects = new Map<string, DOMRect>([
    ["a", rect(100, 40)],
    ["b", rect(140, 40)],
    ["c", rect(180, 40)],
  ]);

  it("selects the last row below the list", () => {
    expect(resolveTopLevelOverclickRow(rows, 400, rects)).toBe("c");
  });

  it("selects the hovered top-level row", () => {
    expect(resolveTopLevelOverclickRow(rows, 150, rects)).toBe("b");
  });

  it("returns null when there are no rows", () => {
    expect(resolveTopLevelOverclickRow([], 100, rects)).toBeNull();
  });
});

describe("resolveColumnRowAtY", () => {
  const column = columnRow("col-a", [row("a1"), row("a2")]);

  it("selects the child under the pointer", () => {
    const rowRects = new Map<string, DOMRect>([
      ["a1", rect(120, 40, 0)],
      ["a2", rect(170, 40, 0)],
    ]);

    expect(resolveColumnRowAtY(column, 135, rowRects)).toBe("a1");
    expect(resolveColumnRowAtY(column, 185, rowRects)).toBe("a2");
  });

  it("selects the last child below the last block rect", () => {
    const rowRects = new Map<string, DOMRect>([
      ["a1", rect(120, 40, 0)],
      ["a2", rect(170, 40, 0)],
    ]);

    expect(resolveColumnRowAtY(column, 350, rowRects)).toBe("a2");
  });

  it("selects the first child when only one short block stretches the column", () => {
    const singleBlockColumn = columnRow("col-b", [row("b1")]);
    const rowRects = new Map<string, DOMRect>([["b1", rect(120, 40, 0)]]);

    expect(resolveColumnRowAtY(singleBlockColumn, 350, rowRects)).toBe("b1");
  });

  it("selects the first child in the top edge band", () => {
    const rowRects = new Map<string, DOMRect>([
      ["a1", rect(120, 40, 0)],
      ["a2", rect(170, 40, 0)],
    ]);

    expect(resolveColumnRowAtY(column, 125, rowRects)).toBe("a1");
  });
});

describe("resolveOverclickRowFromPointer", () => {
  const rows = [row("a"), row("b"), row("c")];
  const rowRects = new Map<string, DOMRect>([
    ["a", rect(100, 40)],
    ["b", rect(140, 40)],
    ["c", rect(180, 40)],
  ]);

  it("returns null when rows are empty", () => {
    expect(resolveOverclickRowFromPointer([], 50, 120, rowRects)).toBeNull();
  });

  it("selects the last row below the page list", () => {
    expect(resolveOverclickRowFromPointer(rows, 50, 300, rowRects)).toBe("c");
  });

  it("selects the top-level row under the pointer", () => {
    expect(resolveOverclickRowFromPointer(rows, 50, 150, rowRects)).toBe("b");
  });
});
