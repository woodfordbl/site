import { describe, expect, it } from "vitest";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { normalizeDropTarget } from "@/lib/canvas/drop-target.ts";
import {
  resolveColumnContentDrop,
  resolveDropTargetFromPointer,
} from "@/lib/canvas/resolve-drop-target.ts";

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

describe("normalizeDropTarget", () => {
  const rows = [row("a"), row("b"), row("c")];

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

  it("keeps after on the last row in a column without targeting the next column", () => {
    const columnsTree: CanvasRow[] = [
      {
        rowId: "cols",
        effectiveBlock: { id: "cols", type: "columns", props: {} },
        children: [
          columnRow("col-a", [row("a1"), row("a2")]),
          columnRow("col-b", [row("b1")]),
        ],
      },
    ];

    expect(normalizeDropTarget(columnsTree, "a2", "after")).toEqual({
      rowId: "a2",
      edge: "after",
    });
    expect(normalizeDropTarget(columnsTree, "a1", "after")).toEqual({
      rowId: "a2",
      edge: "before",
    });
  });
});

describe("resolveDropTargetFromPointer", () => {
  const rows = [row("a"), row("b"), row("c")];
  const rowRects = new Map<string, DOMRect>([
    ["a", rect(100, 40)],
    ["b", rect(150, 40)],
    ["c", rect(200, 40)],
  ]);

  it("returns null when not dragging", () => {
    expect(
      resolveDropTargetFromPointer(rows, 50, 120, rowRects, null)
    ).toBeNull();
  });

  it("returns null when rows are empty", () => {
    expect(resolveDropTargetFromPointer([], 50, 120, rowRects, "a")).toBeNull();
  });

  it("snaps above the first top-level row to before", () => {
    expect(resolveDropTargetFromPointer(rows, 50, 50, rowRects, "b")).toEqual({
      rowId: "a",
      edge: "before",
    });
  });

  it("snaps below the last top-level row to after", () => {
    expect(resolveDropTargetFromPointer(rows, 50, 300, rowRects, "a")).toEqual({
      rowId: "c",
      edge: "after",
    });
  });

  it("resolves before on midpoint hit-test", () => {
    expect(resolveDropTargetFromPointer(rows, 50, 110, rowRects, "c")).toEqual({
      rowId: "a",
      edge: "before",
    });
  });

  it("resolves after to next row before on lower half", () => {
    expect(resolveDropTargetFromPointer(rows, 50, 130, rowRects, "c")).toEqual({
      rowId: "b",
      edge: "before",
    });
  });

  it("keeps after on the last row lower half", () => {
    expect(resolveDropTargetFromPointer(rows, 50, 230, rowRects, "a")).toEqual({
      rowId: "c",
      edge: "after",
    });
  });

  it("returns null when hovering the dragged row", () => {
    expect(
      resolveDropTargetFromPointer(rows, 50, 110, rowRects, "a")
    ).toBeNull();
  });

  it("resolves nested list rows in document order", () => {
    const nestedRows = [
      row("list", [row("item-a"), row("item-b")]),
      row("after-list"),
    ];
    const nestedRects = new Map<string, DOMRect>([
      ["list", rect(100, 80)],
      ["item-a", rect(110, 30)],
      ["item-b", rect(150, 30)],
      ["after-list", rect(200, 40)],
    ]);

    expect(
      resolveDropTargetFromPointer(
        nestedRows,
        50,
        115,
        nestedRects,
        "after-list"
      )
    ).toEqual({
      rowId: "item-a",
      edge: "before",
    });
  });
});

describe("resolveColumnContentDrop", () => {
  const columnsTree: CanvasRow[] = [
    {
      rowId: "cols",
      effectiveBlock: { id: "cols", type: "columns", props: {} },
      children: [
        columnRow("col-a", [row("a1"), row("a2")]),
        columnRow("col-b", [row("b1")]),
      ],
    },
  ];

  it("targets column scope start above the first block", () => {
    const rowRects = new Map<string, DOMRect>([
      ["a1", rect(120, 40, 0)],
      ["a2", rect(170, 40, 0)],
    ]);

    expect(
      resolveColumnContentDrop(columnsTree, "col-a", 125, rowRects, "b1")
    ).toEqual({
      rowId: "col-a",
      edge: "before",
      atScopeStart: true,
    });
  });

  it("targets after the last block in the column scope end band", () => {
    const rowRects = new Map<string, DOMRect>([
      ["a1", rect(120, 40, 0)],
      ["a2", rect(170, 40, 0)],
    ]);

    expect(
      resolveColumnContentDrop(columnsTree, "col-a", 205, rowRects, "b1")
    ).toEqual({
      rowId: "a2",
      edge: "after",
    });
  });

  it("resolves within-column reorder using child rows only", () => {
    const rowRects = new Map<string, DOMRect>([
      ["a1", rect(120, 40, 0, 200)],
      ["a2", rect(170, 40, 0, 200)],
      ["b1", rect(120, 40, 220, 200)],
    ]);

    expect(
      resolveColumnContentDrop(columnsTree, "col-a", 155, rowRects, "b1")
    ).toEqual({
      rowId: "a2",
      edge: "before",
    });
  });
});

describe("resolveDropTargetFromPointer horizontal filtering", () => {
  it("selects the left column row when the pointer x is over the left column", () => {
    const columnsTree: CanvasRow[] = [
      {
        rowId: "cols",
        effectiveBlock: { id: "cols", type: "columns", props: {} },
        children: [
          columnRow("col-a", [row("a1")]),
          columnRow("col-b", [row("b1")]),
        ],
      },
    ];
    const rowRects = new Map<string, DOMRect>([
      ["a1", rect(120, 40, 0, 200)],
      ["b1", rect(120, 40, 220, 200)],
    ]);

    expect(
      resolveDropTargetFromPointer(columnsTree, 80, 155, rowRects, "b1")
    ).toEqual({
      rowId: "a1",
      edge: "after",
    });
  });
});
