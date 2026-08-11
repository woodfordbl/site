import { describe, expect, it } from "vitest";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { resolveColumnRowAtY } from "@/lib/canvas/resolve-column-row-at-y.ts";
import {
  resolveFocusableOverclickRow,
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

function checklistItem(rowId: string, text = rowId): CanvasRow {
  return {
    rowId,
    effectiveBlock: {
      id: rowId,
      type: "checklistItem",
      props: { text, checked: false },
    },
    children: [],
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

function checklistRow(rowId: string, children: CanvasRow[]): CanvasRow {
  return {
    rowId,
    effectiveBlock: {
      id: rowId,
      type: "checklist",
      props: {},
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

describe("resolveOverclickRowFromPointer — scoped containers", () => {
  function calloutRow(rowId: string, children: CanvasRow[]): CanvasRow {
    return {
      rowId,
      effectiveBlock: { id: rowId, type: "callout", props: {} },
      children,
    } as CanvasRow;
  }

  function columnsRow(rowId: string, children: CanvasRow[]): CanvasRow {
    return {
      rowId,
      effectiveBlock: { id: rowId, type: "columns", props: {} },
      children,
    } as CanvasRow;
  }

  it("routes a click in callout dead space to the row at Y", () => {
    const callout = calloutRow("call", [row("c1"), row("c2")]);
    const rowRects = new Map<string, DOMRect>([
      ["call", rect(0, 120, 0, 400)],
      ["c1", rect(10, 40, 40, 350)],
      ["c2", rect(60, 40, 40, 350)],
    ]);
    const scopeRects = new Map<string, DOMRect>([
      ["call", rect(10, 100, 40, 350)],
    ]);

    // Below the last child but inside the callout's content scope.
    expect(
      resolveOverclickRowFromPointer([callout], 100, 105, rowRects, scopeRects)
    ).toBe("c2");
  });

  it("routes a click in the gutter between columns to the nearest column", () => {
    const cols = columnsRow("cols", [
      columnRow("colA", [row("a1"), row("a2")]),
      columnRow("colB", [row("b1")]),
    ]);
    const rowRects = new Map<string, DOMRect>([
      ["cols", rect(40, 160, 0, 400)],
      ["a1", rect(50, 40, 0, 190)],
      ["a2", rect(100, 40, 0, 190)],
      ["b1", rect(50, 40, 210, 190)],
    ]);
    const scopeRects = new Map<string, DOMRect>([
      ["colA", rect(40, 160, 0, 190)],
      ["colB", rect(40, 160, 210, 190)],
    ]);

    // x=200 sits in the 20px gutter between the two column scopes.
    expect(
      resolveOverclickRowFromPointer([cols], 200, 60, rowRects, scopeRects)
    ).toBe("a1");
    // Inside column B proper resolves its own child.
    expect(
      resolveOverclickRowFromPointer([cols], 300, 60, rowRects, scopeRects)
    ).toBe("b1");
  });

  it("ignores unmounted scopes (collapsed toggle) and falls back to top level", () => {
    const toggle: CanvasRow = {
      rowId: "tog",
      effectiveBlock: {
        id: "tog",
        type: "toggleHeading",
        props: { level: 2, text: "Toggle" },
      },
      children: [row("t1")],
    };
    const rowRects = new Map<string, DOMRect>([["tog", rect(0, 40, 0, 400)]]);

    expect(
      resolveOverclickRowFromPointer(
        [toggle],
        100,
        20,
        rowRects,
        new Map<string, DOMRect>()
      )
    ).toBe("tog");
  });
});

describe("resolveOverclickRowFromPointer — list/checklist endings", () => {
  it("focuses the last checklist item when clicking below a checklist-only page", () => {
    const checklist = checklistRow("check", [
      checklistItem("i1", "one"),
      checklistItem("i2", "item"),
    ]);
    const rowRects = new Map<string, DOMRect>([
      ["check", rect(100, 80)],
      ["i1", rect(100, 40)],
      ["i2", rect(140, 40)],
    ]);

    expect(resolveOverclickRowFromPointer([checklist], 50, 400, rowRects)).toBe(
      "i2"
    );
  });

  it("focuses the last list item when clicking below a list with no trailing blank", () => {
    const list = listRow("list", [row("li1"), row("li2"), row("li3")]);
    const rowRects = new Map<string, DOMRect>([
      ["list", rect(100, 120)],
      ["li1", rect(100, 40)],
      ["li2", rect(140, 40)],
      ["li3", rect(180, 40)],
    ]);

    expect(resolveOverclickRowFromPointer([list], 50, 500, rowRects)).toBe(
      "li3"
    );
  });

  it("focuses the list item under the pointer inside the list shell", () => {
    const list = listRow("list", [row("li1"), row("li2")]);
    const rowRects = new Map<string, DOMRect>([
      ["list", rect(100, 80)],
      ["li1", rect(100, 40)],
      ["li2", rect(140, 40)],
    ]);

    expect(resolveOverclickRowFromPointer([list], 50, 115, rowRects)).toBe(
      "li1"
    );
  });

  it("still focuses a trailing empty text below a checklist", () => {
    const checklist = checklistRow("check", [checklistItem("i1", "item")]);
    const blank: CanvasRow = {
      rowId: "blank",
      effectiveBlock: { id: "blank", type: "text", props: { text: "" } },
      children: [],
    };
    const rows = [checklist, blank];
    const rowRects = new Map<string, DOMRect>([
      ["check", rect(100, 40)],
      ["i1", rect(100, 40)],
      ["blank", rect(140, 40)],
    ]);

    expect(resolveOverclickRowFromPointer(rows, 50, 400, rowRects)).toBe(
      "blank"
    );
  });
});

describe("resolveFocusableOverclickRow", () => {
  it("maps a checklist container to the last item when below all children", () => {
    const checklist = checklistRow("check", [
      checklistItem("i1"),
      checklistItem("i2"),
    ]);
    const rowRects = new Map<string, DOMRect>([
      ["check", rect(100, 80)],
      ["i1", rect(100, 40)],
      ["i2", rect(140, 40)],
    ]);

    expect(
      resolveFocusableOverclickRow([checklist], "check", 400, rowRects)
    ).toBe("i2");
  });
});
