import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import {
  clampTableColumnCount,
  clampTableRowCount,
  computeTableScrubDelta,
  planTableAddRow,
  planTableRemoveRow,
} from "@/lib/canvas/table-layout.ts";
import type { Block } from "@/lib/schemas/block.ts";

function buildSimpleTableBlocks(): Block[] {
  const table = createEmptyBlock("table") as Extract<Block, { type: "table" }>;
  table.props = {
    hasHeaderRow: false,
    hasHeaderColumn: false,
    columnWidths: [120, 120],
  };

  const row1 = createEmptyBlock("tableRow") as Extract<
    Block,
    { type: "tableRow" }
  >;
  row1.parentId = table.id;
  const row2 = createEmptyBlock("tableRow") as Extract<
    Block,
    { type: "tableRow" }
  >;
  row2.parentId = table.id;

  const cells = [row1, row2].flatMap((row) =>
    Array.from({ length: 2 }, () => {
      const cell = createEmptyBlock("tableCell") as Extract<
        Block,
        { type: "tableCell" }
      >;
      cell.parentId = row.id;
      cell.props = { text: "" };
      return cell;
    })
  );

  return [table, row1, row2, ...cells];
}

describe("computeTableScrubDelta", () => {
  it("counts a half step toward add/remove", () => {
    expect(computeTableScrubDelta(18, 36)).toBe(1);
    expect(computeTableScrubDelta(17, 36)).toBe(0);
    expect(computeTableScrubDelta(-18, 36)).toBe(-1);
    expect(computeTableScrubDelta(-17, 36)).toBe(0);
    expect(computeTableScrubDelta(54, 36)).toBe(2);
    expect(computeTableScrubDelta(-54, 36)).toBe(-2);
  });

  it("returns zero for invalid step size", () => {
    expect(computeTableScrubDelta(100, 0)).toBe(0);
  });
});

describe("clampTableRowCount", () => {
  it("floors at MIN_TABLE_ROWS", () => {
    expect(clampTableRowCount(0)).toBe(1);
    expect(clampTableRowCount(5)).toBe(5);
  });
});

describe("clampTableColumnCount", () => {
  it("clamps between min and max columns", () => {
    expect(clampTableColumnCount(1)).toBe(2);
    expect(clampTableColumnCount(5)).toBe(5);
    expect(clampTableColumnCount(12)).toBe(10);
  });
});

describe("table scrub planners", () => {
  it("adds a trailing row without focus when requested", () => {
    const rows = buildBlockTree(buildSimpleTableBlocks());
    const lastRowId = rows[0]?.children.at(-1)?.rowId ?? "";
    const effects = planTableAddRow(rows, lastRowId, "after", { focus: false });

    expect(
      effects.some(
        (effect) => effect.type === "insert" && effect.block.type === "tableRow"
      )
    ).toBe(true);
    expect(effects.some((effect) => effect.type === "focus")).toBe(false);
  });

  it("removes a trailing row via planTableRemoveRow", () => {
    const rows = buildBlockTree(buildSimpleTableBlocks());
    const lastRowId = rows[0]?.children.at(-1)?.rowId ?? "";
    const effects = planTableRemoveRow(rows, lastRowId);

    expect(effects.some((effect) => effect.type === "delete")).toBe(true);
  });
});
