import { describe, expect, it } from "vitest";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import {
  normalizeDropTarget,
  resolveDropTargetFromPointer,
} from "@/lib/canvas/resolve-drop-target.ts";

function row(
  rowId: string,
  sortOrder: number,
  children: CanvasRow[] = []
): CanvasRow {
  return {
    rowId,
    sortOrder,
    effectiveBlock: {
      id: rowId,
      type: "text",
      props: { text: rowId },
    },
    children,
  };
}

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("normalizeDropTarget", () => {
  const rows = [row("a", 0), row("b", 1000), row("c", 2000)];

  it("keeps before on the hovered row", () => {
    expect(normalizeDropTarget(rows, "b", "before")).toEqual({
      rowId: "b",
      edge: "before",
    });
  });

  it("maps after to the next row before", () => {
    expect(normalizeDropTarget(rows, "a", "after")).toEqual({
      rowId: "b",
      edge: "before",
    });
  });

  it("keeps after on the last row", () => {
    expect(normalizeDropTarget(rows, "c", "after")).toEqual({
      rowId: "c",
      edge: "after",
    });
  });
});

describe("resolveDropTargetFromPointer", () => {
  const rows = [row("a", 0), row("b", 1000), row("c", 2000)];
  const rowRects = new Map<string, DOMRect>([
    ["a", rect(100, 40)],
    ["b", rect(150, 40)],
    ["c", rect(200, 40)],
  ]);

  it("returns null when not dragging", () => {
    expect(resolveDropTargetFromPointer(rows, 120, rowRects, null)).toBeNull();
  });

  it("returns null when rows are empty", () => {
    expect(resolveDropTargetFromPointer([], 120, rowRects, "a")).toBeNull();
  });

  it("snaps above the first top-level row to before", () => {
    expect(resolveDropTargetFromPointer(rows, 50, rowRects, "b")).toEqual({
      rowId: "a",
      edge: "before",
    });
  });

  it("snaps below the last top-level row to after", () => {
    expect(resolveDropTargetFromPointer(rows, 300, rowRects, "a")).toEqual({
      rowId: "c",
      edge: "after",
    });
  });

  it("resolves before on midpoint hit-test", () => {
    expect(resolveDropTargetFromPointer(rows, 110, rowRects, "c")).toEqual({
      rowId: "a",
      edge: "before",
    });
  });

  it("resolves after to next row before on lower half", () => {
    expect(resolveDropTargetFromPointer(rows, 130, rowRects, "c")).toEqual({
      rowId: "b",
      edge: "before",
    });
  });

  it("keeps after on the last row lower half", () => {
    expect(resolveDropTargetFromPointer(rows, 230, rowRects, "a")).toEqual({
      rowId: "c",
      edge: "after",
    });
  });

  it("returns null when hovering the dragged row", () => {
    expect(resolveDropTargetFromPointer(rows, 110, rowRects, "a")).toBeNull();
  });

  it("resolves nested list rows in document order", () => {
    const nestedRows = [
      row("list", 0, [row("item-a", 100), row("item-b", 200)]),
      row("after-list", 1000),
    ];
    const nestedRects = new Map<string, DOMRect>([
      ["list", rect(100, 80)],
      ["item-a", rect(110, 30)],
      ["item-b", rect(150, 30)],
      ["after-list", rect(200, 40)],
    ]);

    expect(
      resolveDropTargetFromPointer(nestedRows, 115, nestedRects, "after-list")
    ).toEqual({
      rowId: "item-a",
      edge: "before",
    });
  });
});
