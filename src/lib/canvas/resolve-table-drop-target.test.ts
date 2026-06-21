// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { resolveTableLayoutDrop } from "@/lib/canvas/resolve-table-drop-target.ts";
import { buildTableBlock } from "@/lib/canvas/table-layout.ts";
import type { Block } from "@/lib/schemas/block.ts";

function rect(top: number, height: number, left = 0, width = 400): DOMRect {
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

function buildFixtureTableBlocks(): Block[] {
  const t1 = buildTableBlock("t1", {
    indent: 0,
    parentId: null,
    columnCount: 3,
    hasHeaderRow: true,
  });

  const rows: Block[] = [
    { id: "r1", type: "tableRow", parentId: "t1", props: {} },
    { id: "r2", type: "tableRow", parentId: "t1", props: {} },
    { id: "r3", type: "tableRow", parentId: "t1", props: {} },
  ];

  const cells: Block[] = [
    { id: "c1", type: "tableCell", parentId: "r1", props: { text: "Name" } },
    { id: "c2", type: "tableCell", parentId: "r1", props: { text: "Role" } },
    { id: "c3", type: "tableCell", parentId: "r1", props: { text: "Team" } },
    { id: "c4", type: "tableCell", parentId: "r2", props: { text: "Ada" } },
    { id: "c5", type: "tableCell", parentId: "r2", props: { text: "Eng" } },
    { id: "c6", type: "tableCell", parentId: "r2", props: { text: "Core" } },
    { id: "c7", type: "tableCell", parentId: "r3", props: { text: "Lin" } },
    { id: "c8", type: "tableCell", parentId: "r3", props: { text: "Design" } },
    { id: "c9", type: "tableCell", parentId: "r3", props: { text: "UX" } },
  ];

  return [t1, ...rows, ...cells];
}

function mountTableLayout(options: {
  layoutRect: DOMRect;
  rowRects: Map<string, DOMRect>;
  tableId?: string;
}): HTMLElement {
  const layout = document.createElement("div");
  layout.setAttribute("data-table-layout", "");
  layout.setAttribute("data-table-id", options.tableId ?? "t1");
  layout.getBoundingClientRect = () => options.layoutRect;

  for (const [rowId, rowRect] of options.rowRects) {
    const rowElement = document.createElement("tr");
    rowElement.setAttribute("data-table-row-id", rowId);
    rowElement.getBoundingClientRect = () => rowRect;
    layout.appendChild(rowElement);
  }

  document.body.appendChild(layout);
  return layout;
}

describe("resolveTableLayoutDrop", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const blocks = buildFixtureTableBlocks();
  const rows = buildBlockTree(blocks);

  it("returns null when pointer is outside the layout", () => {
    mountTableLayout({
      layoutRect: rect(100, 120),
      rowRects: new Map([
        ["r1", rect(100, 30)],
        ["r2", rect(130, 30)],
        ["r3", rect(160, 30)],
      ]),
    });

    expect(resolveTableLayoutDrop(rows, 50, 50, "r3")).toBeNull();
  });

  it("skips the header row when hasHeaderRow is true", () => {
    mountTableLayout({
      layoutRect: rect(100, 120),
      rowRects: new Map([
        ["r1", rect(100, 30)],
        ["r2", rect(130, 30)],
        ["r3", rect(160, 30)],
      ]),
    });

    expect(resolveTableLayoutDrop(rows, 200, 115, "r3")).toBeNull();
  });

  it("resolves before on the upper half of a body row", () => {
    mountTableLayout({
      layoutRect: rect(100, 120),
      rowRects: new Map([
        ["r1", rect(100, 30)],
        ["r2", rect(130, 30)],
        ["r3", rect(160, 30)],
      ]),
    });

    expect(resolveTableLayoutDrop(rows, 200, 140, "r3")).toEqual({
      rowId: "r2",
      edge: "before",
    });
  });

  it("maps after on a body row to the next row before", () => {
    mountTableLayout({
      layoutRect: rect(100, 120),
      rowRects: new Map([
        ["r1", rect(100, 30)],
        ["r2", rect(130, 30)],
        ["r3", rect(160, 30)],
      ]),
    });

    expect(resolveTableLayoutDrop(rows, 200, 150, "r3")).toEqual({
      rowId: "r3",
      edge: "before",
    });
  });

  it("returns null when hovering the dragged row", () => {
    mountTableLayout({
      layoutRect: rect(100, 120),
      rowRects: new Map([
        ["r1", rect(100, 30)],
        ["r2", rect(130, 30)],
        ["r3", rect(160, 30)],
      ]),
    });

    expect(resolveTableLayoutDrop(rows, 200, 145, "r2")).toBeNull();
  });
});
