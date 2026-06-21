import { describe, expect, it } from "vitest";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import {
  resolveInsertSiblingIndex,
  resolveRowPlacementPlan,
  resolveScopeStartPlacement,
} from "@/lib/blocks/row-placement.ts";
import type { Block } from "@/lib/schemas/block.ts";

function canvasRow(blockId: string, parentId?: string): CanvasRow {
  return {
    rowId: blockId,
    effectiveBlock: {
      id: blockId,
      type: "text",
      props: { text: blockId },
      ...(parentId ? { parentId } : {}),
    },
    children: [],
  };
}

describe("row-placement", () => {
  const canvasServerBlocks: Block[] = [
    { id: "hero", type: "heading", props: { level: 1, text: "Hero" } },
    { id: "bio", type: "text", props: { text: "Bio" } },
  ];

  it("resolves after placement on last server row", () => {
    const rows = buildBlockTree(canvasServerBlocks);
    const bioRow = rows[1];
    expect(bioRow).toBeDefined();
    if (!bioRow) {
      return;
    }

    expect(resolveRowPlacementPlan(rows, bioRow.rowId, "after")).toEqual({
      parentId: null,
      anchorRowId: "bio",
      edge: "after",
    });
  });

  it("resolves before placement on middle server row", () => {
    const rows = buildBlockTree(canvasServerBlocks);
    const bioRow = rows[1];
    expect(bioRow).toBeDefined();
    if (!bioRow) {
      return;
    }

    expect(resolveRowPlacementPlan(rows, bioRow.rowId, "before")).toEqual({
      parentId: null,
      anchorRowId: "bio",
      edge: "before",
    });
  });

  it("inserts immediately after the target row", () => {
    const siblings = [
      canvasRow("hero"),
      canvasRow("bio"),
      canvasRow("note-block"),
    ];

    expect(resolveInsertSiblingIndex(siblings, 1, "after")).toBe(2);
  });

  it("inserts immediately after a user row in a stack without skipping to the end", () => {
    const siblings = [
      canvasRow("hero"),
      canvasRow("bio"),
      canvasRow("block-a"),
      canvasRow("block-b"),
      canvasRow("block-c"),
    ];

    expect(resolveInsertSiblingIndex(siblings, 3, "after")).toBe(4);
  });

  it("inserts immediately before a user row in a stack", () => {
    const siblings = [
      canvasRow("hero"),
      canvasRow("bio"),
      canvasRow("block-a"),
      canvasRow("block-b"),
      canvasRow("block-c"),
    ];

    expect(resolveInsertSiblingIndex(siblings, 3, "before")).toBe(3);
  });

  it("resolves before first row at page start", () => {
    const rows = buildBlockTree(canvasServerBlocks);
    const heroRow = rows[0];
    expect(heroRow).toBeDefined();
    if (!heroRow) {
      return;
    }

    expect(resolveRowPlacementPlan(rows, heroRow.rowId, "before")).toEqual({
      parentId: null,
      anchorRowId: "hero",
      edge: "before",
    });
  });

  it("resolves scope start for an empty list container", () => {
    const rows = buildBlockTree([
      { id: "list-1", type: "list", props: { variant: "bullet" } },
    ]);

    expect(resolveScopeStartPlacement(rows, "list-1")).toEqual({
      parentId: "list-1",
      atScopeStart: true,
    });
  });
});
