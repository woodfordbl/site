import { describe, expect, it, vi } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import {
  deleteBlockByRowId,
  insertBlockAtPlacement,
  moveBlockByRowId,
  updateBlockByRowId,
} from "@/lib/blocks/page-block-mutations.ts";
import { applyCanvasEffects } from "@/lib/canvas/apply-effects.ts";
import type { CanvasEffect } from "@/lib/canvas/effects.ts";
import { canvasReducer } from "@/lib/canvas/reducer.ts";
import {
  buildBlocksForTableCreate,
  buildTableBlock,
  computeTableColumnResizeWidths,
  computeTableFitToWidthColumnWidths,
  planTableCreate,
  planTableFocusAdjacentCell,
  planTableRemoveColumn,
  planTableReorderColumn,
  planTableUpdateColumnWidths,
} from "@/lib/canvas/table-layout.ts";
import type { Block } from "@/lib/schemas/block.ts";

function applyEffectsInMemory(
  blocks: Block[],
  effects: CanvasEffect[]
): Block[] {
  let workingBlocks = [...blocks];
  let workingRows = buildBlockTree(workingBlocks);

  applyCanvasEffects(
    effects,
    {
      saveRow: (rowId, block) => {
        workingBlocks = updateBlockByRowId(workingBlocks, rowId, block);
        workingRows = buildBlockTree(workingBlocks);
      },
      deleteRow: (rowId) => {
        workingBlocks = deleteBlockByRowId(workingBlocks, workingRows, rowId);
        workingRows = buildBlockTree(workingBlocks);
      },
      insertRow: (position, block) => {
        workingBlocks = insertBlockAtPlacement(
          workingBlocks,
          workingRows,
          position,
          block
        );
        workingRows = buildBlockTree(workingBlocks);
        return block.id;
      },
      moveRow: (rowId, position) => {
        workingBlocks = moveBlockByRowId(
          workingBlocks,
          workingRows,
          rowId,
          position
        );
        workingRows = buildBlockTree(workingBlocks);
      },
      revertToServer: vi.fn(),
      acknowledgeServerBaseline: vi.fn(),
      savePageBlocks: (nextBlocks) => {
        workingBlocks = nextBlocks;
        workingRows = buildBlockTree(workingBlocks);
      },
    },
    workingRows,
    vi.fn()
  );

  return workingBlocks;
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

describe("computeTableColumnResizeWidths — only resized column changes", () => {
  it("adds delta to the target column in pixels and leaves others fixed", () => {
    const next = computeTableColumnResizeWidths({
      columnWidths: [120, 120, 120],
      columnIndex: 0,
      deltaPx: 90,
    });
    expect(next).toEqual([210, 120, 120]);
  });

  it("clamps at MIN_TABLE_COLUMN_WIDTH_PX", () => {
    const next = computeTableColumnResizeWidths({
      columnWidths: [120, 120],
      columnIndex: 0,
      deltaPx: -200,
    });
    expect(next[0]).toBe(120);
    expect(next[1]).toBe(120);
  });
});

describe("computeTableFitToWidthColumnWidths", () => {
  it("scales columns proportionally to the target width", () => {
    const next = computeTableFitToWidthColumnWidths([120, 240, 120], 480);
    expect(next.reduce((sum, width) => sum + width, 0)).toBe(480);
    expect(next[1]).toBeGreaterThan(next[0] ?? 0);
  });
});

describe("planTableCreate", () => {
  it("creates a grid with rows and cells", () => {
    const text = { ...createEmptyBlock("text"), id: "row-1", parentId: null };
    const rows = buildBlockTree([text]);
    const effects = planTableCreate(rows, "row-1", {
      columns: 3,
      rows: 3,
    });
    const inserts = effects.filter((e) => e.type === "insert");
    expect(inserts.filter((e) => e.block.type === "tableRow")).toHaveLength(3);
    expect(inserts.filter((e) => e.block.type === "tableCell")).toHaveLength(9);
  });
});

describe("planTableReorderColumn — index 1 to 0 permutes all rows", () => {
  it("moves cells and splices columnWidths", () => {
    const blocks = buildFixtureTableBlocks();
    const rows = buildBlockTree(blocks);
    const effects = planTableReorderColumn(rows, "t1", 1, 0);

    const nextBlocks = applyEffectsInMemory(blocks, effects);
    const tree = buildBlockTree(nextBlocks);
    const table = tree[0];
    expect(table?.children[0]?.children.map((c) => c.rowId)).toEqual([
      "c2",
      "c1",
      "c3",
    ]);
    expect(table?.children[1]?.children.map((c) => c.rowId)).toEqual([
      "c5",
      "c4",
      "c6",
    ]);
    expect(table?.children[2]?.children.map((c) => c.rowId)).toEqual([
      "c8",
      "c7",
      "c9",
    ]);
    if (table?.effectiveBlock.type === "table") {
      expect(table.effectiveBlock.props.columnWidths).toEqual([120, 120, 120]);
    }
  });
});

describe("planTableReorderColumn — no-op when fromIndex equals toIndex", () => {
  it("returns empty effects", () => {
    const blocks = buildFixtureTableBlocks();
    const rows = buildBlockTree(blocks);
    expect(planTableReorderColumn(rows, "t1", 1, 1)).toEqual([]);
  });
});

describe("planTableUpdateColumnWidths — writes table.props only", () => {
  it("persists widths on the table block", () => {
    const blocks = buildFixtureTableBlocks();
    const rows = buildBlockTree(blocks);
    const effects = planTableUpdateColumnWidths(rows, "t1", [210, 120, 120]);
    expect(effects).toHaveLength(1);
    const effect = effects[0];
    expect(effect?.type).toBe("persist");
    if (effect?.type !== "persist") {
      return;
    }
    expect(effect.rowId).toBe("t1");
    if (effect.block.type === "table") {
      expect(effect.block.props.columnWidths).toEqual([210, 120, 120]);
    }
  });
});

describe("planTableRemoveColumn — at MIN_TABLE_COLS returns noop", () => {
  it("does not remove when only two columns remain", () => {
    const blocks = buildFixtureTableBlocks();
    let rows = buildBlockTree(blocks);
    let working = blocks;
    for (const index of [2, 1]) {
      const effects = planTableRemoveColumn(rows, "t1", index);
      const applied = applyEffectsInMemory(working, effects);
      working = applied;
      rows = buildBlockTree(working);
    }
    expect(planTableRemoveColumn(rows, "t1", 0)).toEqual([]);
  });
});

describe("planTableFocusCell — Tab from c4 focuses c5", () => {
  it("focuses the next cell in the row", () => {
    const blocks = buildFixtureTableBlocks();
    const rows = buildBlockTree(blocks);
    const effects = planTableFocusAdjacentCell(rows, "c4", "next");
    expect(effects).toEqual([
      { type: "focus", rowId: "c5", placement: "start" },
    ]);
  });
});

describe("canvasReducer table.create", () => {
  it("emits a single table.apply effect", () => {
    const text = { ...createEmptyBlock("text"), id: "row-1", parentId: null };
    const rows = buildBlockTree([text]);
    const { effects } = canvasReducer(
      { rows },
      {
        type: "table.create",
        rowId: "row-1",
        columns: 3,
        rows: 3,
      }
    );

    expect(effects).toHaveLength(1);
    expect(effects[0]?.type).toBe("table.apply");
  });
});

describe("buildBlocksForTableCreate", () => {
  it("builds a 3x3 table with focus on first cell", () => {
    const text = { ...createEmptyBlock("text"), id: "row-1", parentId: null };
    const rows = buildBlockTree([text]);
    const { blocks, focusRowId } = buildBlocksForTableCreate(
      [text],
      rows,
      "row-1",
      {
        columns: 3,
        rows: 3,
        seedText: "hello",
      }
    );
    const tree = buildBlockTree(blocks);
    expect(tree[0]?.effectiveBlock.type).toBe("table");
    expect(tree[0]?.children).toHaveLength(3);
    expect(tree[0]?.children[0]?.children).toHaveLength(3);
    expect(focusRowId).toBeTruthy();
  });
});

describe("planTableRowMove — r3 before r2 preserves cell groupings", () => {
  it("moves the row subtree intact", () => {
    const blocks = buildFixtureTableBlocks();
    const rows = buildBlockTree(blocks);
    const { effects } = canvasReducer(
      { rows },
      {
        type: "row.move",
        rowId: "r3",
        targetRowId: "r2",
        edge: "before",
      }
    );
    const nextBlocks = applyEffectsInMemory(blocks, effects);
    const tree = buildBlockTree(nextBlocks);
    expect(tree[0]?.children.map((row) => row.rowId)).toEqual([
      "r1",
      "r3",
      "r2",
    ]);
    expect(tree[0]?.children[1]?.children.map((c) => c.rowId)).toEqual([
      "c7",
      "c8",
      "c9",
    ]);
  });
});
