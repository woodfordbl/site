import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { insertBlockAtPlacement } from "@/lib/blocks/page-block-mutations.ts";
import {
  buildBlocksForColumnsCreate,
  buildColumnBlock,
  computeColumnResizeWidths,
  planColumnsCreate,
  planColumnsRemoveColumn,
} from "@/lib/canvas/columns-layout.ts";
import { canvasReducer } from "@/lib/canvas/reducer.ts";
import { resolveStructuralAction } from "@/lib/canvas/resolve-structural-action.ts";
import { buildStructuralContext } from "@/lib/canvas/structural-context.ts";
import type { Block } from "@/lib/schemas/block.ts";

function textBlock(id: string, parentId: string | null, text = ""): Block {
  return {
    ...createEmptyBlock("text"),
    id,
    parentId,
    props: { text },
  };
}

describe("computeColumnResizeWidths", () => {
  it("uses full flex sum for 3-column layouts (not pair total only)", () => {
    const { leftWidth } = computeColumnResizeWidths({
      containerWidthPx: 900,
      deltaPx: 90,
      flexSumAll: 3,
      pairTotal: 2,
      startLeftWidth: 1,
    });
    expect(leftWidth).toBeCloseTo(1.3);
  });

  it("matches 2-column behavior when flex sum equals pair total", () => {
    const threeCol = computeColumnResizeWidths({
      containerWidthPx: 800,
      deltaPx: 80,
      flexSumAll: 3,
      pairTotal: 2,
      startLeftWidth: 1,
    });
    const twoCol = computeColumnResizeWidths({
      containerWidthPx: 800,
      deltaPx: 80,
      flexSumAll: 2,
      pairTotal: 2,
      startLeftWidth: 1,
    });
    expect(threeCol.leftWidth).toBeGreaterThan(twoCol.leftWidth);
    expect(twoCol.leftWidth).toBeCloseTo(1.2);
  });
});

describe("planColumnsCreate", () => {
  it("creates N columns each with a text child", () => {
    const text = textBlock("row-1", null, "hello");
    const rows = buildBlockTree([text]);
    const effects = planColumnsCreate(rows, "row-1", 2);

    expect(effects.some((e) => e.type === "persist")).toBe(true);
    const inserts = effects.filter((e) => e.type === "insert");
    const columnInserts = inserts.filter(
      (e) => e.type === "insert" && e.block.type === "column"
    );
    const textInserts = inserts.filter(
      (e) => e.type === "insert" && e.block.type === "text"
    );
    expect(columnInserts).toHaveLength(2);
    expect(textInserts).toHaveLength(2);
  });
});

describe("planColumnsCreate dashboard seed", () => {
  it("seeds each column with an unlinked database block", () => {
    const text = textBlock("row-1", null, "");
    const rows = buildBlockTree([text]);
    const effects = planColumnsCreate(rows, "row-1", 2, "", "database");

    const inserts = effects.filter((e) => e.type === "insert");
    const databaseInserts = inserts.filter(
      (e) => e.type === "insert" && e.block.type === "database"
    );
    const textInserts = inserts.filter(
      (e) => e.type === "insert" && e.block.type === "text"
    );
    expect(databaseInserts).toHaveLength(2);
    expect(textInserts).toHaveLength(0);
    for (const insert of databaseInserts) {
      if (insert.type === "insert" && insert.block.type === "database") {
        expect(insert.block.props.databaseId).toBe("");
      }
    }
  });
});

describe("canvasReducer columns.create", () => {
  it("emits a single columns.apply effect with column children", () => {
    const text = textBlock("row-1", null);
    const rows = buildBlockTree([text]);
    const { effects } = canvasReducer(
      { rows },
      { type: "columns.create", rowId: "row-1", count: 3 }
    );

    expect(effects).toHaveLength(1);
    const apply = effects[0];
    expect(apply?.type).toBe("columns.apply");
    if (apply?.type !== "columns.apply") {
      return;
    }

    const columnBlocks = apply.blocks.filter(
      (block) => block.type === "column"
    );
    const textBlocks = apply.blocks.filter((block) => block.type === "text");
    const tree = buildBlockTree(apply.blocks);
    const firstColumnTextRowId = tree[0]?.children[0]?.children[0]?.rowId;

    expect(columnBlocks).toHaveLength(3);
    expect(textBlocks).toHaveLength(3);
    expect(apply.focusRowId).toBe(firstColumnTextRowId);
  });
});

describe("buildBlocksForColumnsCreate", () => {
  it("builds two columns with a text row in each", () => {
    const text = textBlock("row-1", null, "seed");
    const rows = buildBlockTree([text]);
    const { blocks, focusRowId } = buildBlocksForColumnsCreate(
      [text],
      rows,
      "row-1",
      2,
      ""
    );
    const tree = buildBlockTree(blocks);

    expect(tree[0]?.effectiveBlock.type).toBe("columns");
    expect(tree[0]?.children).toHaveLength(2);
    expect(focusRowId).toBe(tree[0]?.children[0]?.children[0]?.rowId);
  });

  it("builds the dashboard scaffold: a database placeholder per column, first focused", () => {
    const text = textBlock("row-1", null, "");
    const rows = buildBlockTree([text]);
    const { blocks, focusRowId } = buildBlocksForColumnsCreate(
      [text],
      rows,
      "row-1",
      2,
      "",
      "database"
    );
    const tree = buildBlockTree(blocks);
    const firstChild = tree[0]?.children[0]?.children[0];
    const secondChild = tree[0]?.children[1]?.children[0];

    expect(firstChild?.effectiveBlock.type).toBe("database");
    expect(secondChild?.effectiveBlock.type).toBe("database");
    // Focus lands on the first placeholder — its edit component auto-opens
    // the create/link picker.
    expect(focusRowId).toBe(firstChild?.rowId);
  });
});

function buildTwoColumnBlocks(textA = "hello", textB = "world"): Block[] {
  const columns = createEmptyBlock("columns");
  columns.id = "cols";
  const colA = buildColumnBlock("cols");
  colA.id = "col-a";
  const colB = buildColumnBlock("cols");
  colB.id = "col-b";
  const tA = createEmptyBlock("text");
  tA.id = "text-a";
  tA.parentId = "col-a";
  tA.props = { text: textA };
  const tB = createEmptyBlock("text");
  tB.id = "text-b";
  tB.parentId = "col-b";
  tB.props = { text: textB };
  return [columns, colA, colB, tA, tB];
}

describe("column row.split", () => {
  it("inserts a text sibling inside the same column at end of row", () => {
    const blocks = buildTwoColumnBlocks();
    const rows = buildBlockTree(blocks);
    const { effects } = canvasReducer(
      { rows },
      { type: "row.split", rowId: "text-a", start: 5, end: 5 }
    );
    const insert = effects.find((effect) => effect.type === "insert");
    expect(insert?.type).toBe("insert");
    if (insert?.type !== "insert") {
      return;
    }
    expect(insert.block.type).toBe("text");
    expect(insert.block.parentId).toBe("col-a");
    expect(insert.position.parentId).toBe("col-a");
  });

  it("inserts into the same column when pressing Enter on empty text", () => {
    const blocks = buildTwoColumnBlocks("", "world");
    const rows = buildBlockTree(blocks);
    const { effects } = canvasReducer(
      { rows },
      { type: "row.split", rowId: "text-a", start: 0, end: 0 }
    );
    const insert = effects.find((effect) => effect.type === "insert");
    expect(insert?.type).toBe("insert");
    if (insert?.type !== "insert") {
      return;
    }
    expect(insert.block.type).toBe("text");
    expect(insert.block.parentId).toBe("col-a");
    expect(insert.position.parentId).toBe("col-a");
  });

  it("inserts into the last column without adding a column shell", () => {
    const blocks = buildTwoColumnBlocks("left", "right");
    const rows = buildBlockTree(blocks);
    const { effects } = canvasReducer(
      { rows },
      { type: "row.split", rowId: "text-b", start: 5, end: 5 }
    );
    const insert = effects.find((effect) => effect.type === "insert");
    expect(insert?.type).toBe("insert");
    if (insert?.type !== "insert") {
      return;
    }

    const nextBlocks = insertBlockAtPlacement(
      blocks,
      rows,
      insert.position,
      insert.block
    );
    const tree = buildBlockTree(nextBlocks);
    expect(tree[0]?.children).toHaveLength(2);
    expect(tree[0]?.children[1]?.children).toHaveLength(2);
    expect(
      tree[0]?.children[1]?.children.every(
        (row) => row.effectiveBlock.type === "text"
      )
    ).toBe(true);
  });
});

describe("column empty delete", () => {
  it("removes the column when deleting its only block", () => {
    const blocks = buildTwoColumnBlocks("", "world");
    const rows = buildBlockTree(blocks);
    const textRow = rows[0]?.children[0]?.children[0];
    expect(textRow).toBeDefined();
    if (!textRow) {
      return;
    }

    const ctx = buildStructuralContext(rows, textRow.rowId, {
      caretAtStart: true,
      key: "Backspace",
    });
    expect(ctx).not.toBeNull();
    if (!ctx) {
      return;
    }

    const commands = resolveStructuralAction(ctx);
    expect(commands).toEqual([
      { type: "columns.removeColumn", columnRowId: "col-a" },
    ]);
  });

  it("unwraps remaining columns without hoisting deleted column content", () => {
    const blocks = buildTwoColumnBlocks("", "world");
    const rows = buildBlockTree(blocks);
    const effects = planColumnsRemoveColumn(rows, "col-a");
    const deletes = effects.filter((effect) => effect.type === "delete");
    const moves = effects.filter((effect) => effect.type === "move");

    expect(deletes.some((effect) => effect.rowId === "col-a")).toBe(true);
    expect(moves.some((effect) => effect.rowId === "text-a")).toBe(false);
    expect(moves.some((effect) => effect.rowId === "text-b")).toBe(true);
  });
});

describe("buildBlockTree columns nesting", () => {
  it("builds two-level column tree", () => {
    const columns = createEmptyBlock("columns");
    columns.id = "cols";
    const colA = buildColumnBlock("cols");
    colA.id = "col-a";
    const colB = buildColumnBlock("cols");
    colB.id = "col-b";
    const blocks: Block[] = [
      columns,
      colA,
      colB,
      textBlock("t1", "col-a", "a"),
      textBlock("t2", "col-b", "b"),
    ];
    const tree = buildBlockTree(blocks);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.effectiveBlock.type).toBe("columns");
    expect(tree[0]?.children).toHaveLength(2);
    expect(tree[0]?.children[0]?.children).toHaveLength(1);
  });
});
