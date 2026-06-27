import { describe, expect, it } from "vitest";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { normalizeDropTarget } from "@/lib/canvas/drop-target.ts";
import {
  resolveColumnContentDrop,
  resolveDropTargetFromPointer,
  resolveTopLevelInsertEdge,
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

describe("resolveTopLevelInsertEdge", () => {
  const rows = [row("a"), row("b"), row("c")];
  const rects = new Map<string, DOMRect>([
    ["a", rect(100, 40)],
    ["b", rect(140, 40)],
    ["c", rect(180, 40)],
  ]);

  it("inserts before the first row above the list", () => {
    expect(resolveTopLevelInsertEdge(rows, 80, rects)).toEqual({
      rowId: "a",
      edge: "before",
    });
  });

  it("inserts after the last row below the list", () => {
    expect(resolveTopLevelInsertEdge(rows, 400, rects)).toEqual({
      rowId: "c",
      edge: "after",
    });
  });

  it("uses the hovered row's midpoint for before/after", () => {
    expect(resolveTopLevelInsertEdge(rows, 145, rects)).toEqual({
      rowId: "b",
      edge: "before",
    });
    expect(resolveTopLevelInsertEdge(rows, 175, rects)).toEqual({
      rowId: "b",
      edge: "after",
    });
  });

  it("returns null when there are no rows", () => {
    expect(resolveTopLevelInsertEdge([], 100, rects)).toBeNull();
  });
});

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

function toggleRow(
  rowId: string,
  options: { collapsed?: boolean; children?: CanvasRow[] } = {}
): CanvasRow {
  return {
    rowId,
    effectiveBlock: {
      id: rowId,
      type: "toggleHeading",
      props: {
        level: 1,
        text: rowId,
        ...(options.collapsed ? { collapsed: true } : {}),
      },
    },
    children: options.children ?? [],
  };
}

describe("resolveDropTargetFromPointer toggle headings", () => {
  it("drops into an empty, expanded toggle as its first child", () => {
    const rows = [row("a"), toggleRow("tg"), row("z")];
    const rects = new Map<string, DOMRect>([
      ["a", rect(0, 40)],
      ["tg", rect(40, 40)],
      ["z", rect(80, 40)],
    ]);

    expect(resolveDropTargetFromPointer(rows, 50, 55, rects, "a")).toEqual({
      rowId: "tg",
      edge: "before",
      atScopeStart: true,
    });
  });

  it("drops onto an expanded, populated toggle title as its first child", () => {
    const rows = [
      row("a"),
      toggleRow("tg", { children: [row("c1")] }),
      row("z"),
    ];
    const rects = new Map<string, DOMRect>([
      ["a", rect(0, 40)],
      ["tg", rect(40, 40)],
      ["c1", rect(80, 40)],
      ["z", rect(120, 40)],
    ]);

    // Pointer over the toggle's title region (above its visible child) nests the
    // dragged row as the toggle's first child rather than placing it as a sibling.
    expect(resolveDropTargetFromPointer(rows, 50, 55, rects, "a")).toEqual({
      rowId: "tg",
      edge: "before",
      atScopeStart: true,
    });
  });

  it("still nests between visible children of an expanded toggle", () => {
    const rows = [
      row("a"),
      toggleRow("tg", { children: [row("c1")] }),
      row("z"),
    ];
    const rects = new Map<string, DOMRect>([
      ["a", rect(0, 40)],
      ["tg", rect(40, 40)],
      ["c1", rect(80, 40)],
      ["z", rect(120, 40)],
    ]);

    // Pointer over the lower half of the visible child resolves to that child's
    // own edge (which stays inside the toggle scope), not the toggle scope start.
    expect(resolveDropTargetFromPointer(rows, 50, 110, rects, "a")).toEqual({
      rowId: "c1",
      edge: "after",
    });
  });

  it("treats a collapsed toggle as an ordinary before/after target", () => {
    const rows = [
      row("a"),
      toggleRow("tg", { collapsed: true, children: [row("c1")] }),
      row("z"),
    ];
    const rects = new Map<string, DOMRect>([
      ["a", rect(0, 40)],
      ["tg", rect(40, 40)],
      ["z", rect(80, 40)],
    ]);

    // Bottom half of the collapsed toggle -> after it (children stay hidden).
    expect(resolveDropTargetFromPointer(rows, 50, 75, rects, "a")).toEqual({
      rowId: "z",
      edge: "before",
    });
  });
});
