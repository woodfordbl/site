import { describe, expect, it } from "vitest";

import { buildBlockTree, type CanvasRow } from "@/lib/blocks/block-tree.ts";
import { convertBlockType } from "@/lib/blocks/create-block.ts";
import {
  insertBlockAtPlacement,
  moveBlockByRowId,
  updateBlockByRowId,
} from "@/lib/blocks/page-block-mutations.ts";
import type { CanvasEffect } from "@/lib/canvas/effects.ts";
import {
  collectAbsorbableSiblings,
  planToggleHeadingCreate,
  planToggleHeadingUnwrap,
} from "@/lib/canvas/toggle-heading-layout.ts";
import type { Block } from "@/lib/schemas/block.ts";

function heading(id: string, level: 1 | 2 | 3 | 4): Block {
  return { id, type: "heading", props: { level, text: id }, parentId: null };
}

function text(id: string): Block {
  return { id, type: "text", props: { text: id }, parentId: null };
}

function toggle(id: string, level: 1 | 2 | 3 | 4, collapsed?: boolean): Block {
  return {
    id,
    type: "toggleHeading",
    props: { level, text: id, ...(collapsed ? { collapsed } : {}) },
    parentId: null,
  };
}

/** Apply raw persist/move/insert effects to a flat block list for assertions. */
function applyEffects(
  blocks: Block[],
  effects: CanvasEffect[]
): { blocks: Block[]; focusRowId: string | null } {
  let working = blocks;
  let focusRowId: string | null = null;
  for (const effect of effects) {
    const rows = buildBlockTree(working);
    if (effect.type === "persist") {
      working = updateBlockByRowId(working, effect.rowId, effect.block);
    } else if (effect.type === "move") {
      working = moveBlockByRowId(working, rows, effect.rowId, effect.position);
    } else if (effect.type === "insert") {
      working = insertBlockAtPlacement(
        working,
        rows,
        effect.position,
        effect.block
      );
    } else if (effect.type === "focus") {
      focusRowId = effect.rowId;
    }
  }
  return { blocks: working, focusRowId };
}

function childIds(rows: CanvasRow[], rowId: string): string[] {
  const row = rows.find((candidate) => candidate.rowId === rowId);
  return (row?.children ?? []).map((child) => child.rowId);
}

describe("collectAbsorbableSiblings", () => {
  function rowsFor(...blocks: Block[]): CanvasRow[] {
    return buildBlockTree(blocks);
  }

  it("stops at the next equal-or-higher heading", () => {
    const rows = rowsFor(
      heading("a", 1),
      text("t1"),
      text("t2"),
      heading("b", 1)
    );
    const absorbed = collectAbsorbableSiblings(rows, 0, 1);
    expect(absorbed.map((row) => row.rowId)).toEqual(["t1", "t2"]);
  });

  it("absorbs deeper headings but stops at an equal/higher one", () => {
    const rows = rowsFor(
      heading("a", 1),
      heading("sub", 2),
      text("t1"),
      heading("b", 1),
      text("t2")
    );
    const absorbed = collectAbsorbableSiblings(rows, 0, 1);
    expect(absorbed.map((row) => row.rowId)).toEqual(["sub", "t1"]);
  });

  it("absorbs to the end of the scope when nothing terminates the run", () => {
    const rows = rowsFor(heading("a", 2), text("t1"), heading("deep", 3));
    const absorbed = collectAbsorbableSiblings(rows, 0, 2);
    expect(absorbed.map((row) => row.rowId)).toEqual(["t1", "deep"]);
  });

  it("stops at a sibling toggle heading of equal level", () => {
    const rows = rowsFor(heading("a", 1), text("t1"), toggle("tg", 1));
    const absorbed = collectAbsorbableSiblings(rows, 0, 1);
    expect(absorbed.map((row) => row.rowId)).toEqual(["t1"]);
  });
});

describe("planToggleHeadingCreate", () => {
  it("absorbs following siblings as children when absorb is set", () => {
    const blocks = [heading("a", 1), text("t1"), text("t2"), heading("b", 1)];
    const rows = buildBlockTree(blocks);
    const effects = planToggleHeadingCreate(rows, "a", 1, { absorb: true });
    const { blocks: next } = applyEffects(blocks, effects);
    const tree = buildBlockTree(next);

    expect(tree.map((row) => row.rowId)).toEqual(["a", "b"]);
    expect(tree[0]?.effectiveBlock.type).toBe("toggleHeading");
    expect(childIds(tree, "a")).toEqual(["t1", "t2"]);
  });

  it("creates an empty toggle (no absorb) for slash inserts", () => {
    const blocks = [text("a"), text("t1"), text("t2")];
    const rows = buildBlockTree(blocks);
    const effects = planToggleHeadingCreate(rows, "a", 1, { absorb: false });
    const { blocks: next } = applyEffects(blocks, effects);
    const tree = buildBlockTree(next);

    expect(tree.map((row) => row.rowId)).toEqual(["a", "t1", "t2"]);
    expect(tree[0]?.effectiveBlock.type).toBe("toggleHeading");
    expect(childIds(tree, "a")).toEqual([]);
  });

  it("re-levels an existing toggle without absorbing or losing children", () => {
    const blocks = [toggle("a", 1, true), text("t1"), text("after")];
    const withChild: Block[] = blocks.map((block) =>
      block.id === "t1" ? { ...block, parentId: "a" } : block
    );
    const rows = buildBlockTree(withChild);
    const effects = planToggleHeadingCreate(rows, "a", 3, { absorb: true });
    const { blocks: next } = applyEffects(withChild, effects);
    const tree = buildBlockTree(next);

    const toggleBlock = tree[0]?.effectiveBlock;
    expect(toggleBlock?.type).toBe("toggleHeading");
    if (toggleBlock?.type === "toggleHeading") {
      expect(toggleBlock.props.level).toBe(3);
      expect(toggleBlock.props.collapsed).toBe(true);
    }
    expect(childIds(tree, "a")).toEqual(["t1"]);
    expect(tree.map((row) => row.rowId)).toEqual(["a", "after"]);
  });
});

describe("planToggleHeadingUnwrap", () => {
  it("lifts children out as following siblings in order", () => {
    const blocks: Block[] = [
      toggle("a", 2),
      { ...text("c1"), parentId: "a" },
      { ...text("c2"), parentId: "a" },
      text("after"),
    ];
    const rows = buildBlockTree(blocks);
    const converted = convertBlockType(rows[0].effectiveBlock, "heading", {
      headingLevel: 2,
    });
    const effects = planToggleHeadingUnwrap(rows, "a", converted);
    const { blocks: next } = applyEffects(blocks, effects);
    const tree = buildBlockTree(next);

    expect(tree.map((row) => row.rowId)).toEqual(["a", "c1", "c2", "after"]);
    expect(tree[0]?.effectiveBlock.type).toBe("heading");
    expect(childIds(tree, "a")).toEqual([]);
  });
});
