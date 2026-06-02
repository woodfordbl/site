import { beforeEach, describe, expect, it } from "vitest";

import { buildBlockTree, flattenRows } from "@/db/queries/merge-blocks.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { insertBlockAtPlacement } from "@/lib/blocks/page-block-mutations.ts";
import { resolveRowPlacementPlan } from "@/lib/blocks/row-placement.ts";
import type { Block } from "@/lib/schemas/block.ts";

let insertCounter = 0;

function nextInsertId(): string {
  insertCounter += 1;
  return `insert-${insertCounter}`;
}

function resetInsertCounter(): void {
  insertCounter = 0;
}

function topLevelBlockIds(rows: ReturnType<typeof buildBlockTree>): string[] {
  return rows.map((row) => row.effectiveBlock.id);
}

function listChildBlockIds(
  rows: ReturnType<typeof buildBlockTree>,
  listBlockId: string
): string[] {
  const listRow = rows.find((row) => row.effectiveBlock.id === listBlockId);
  return listRow?.children.map((child) => child.effectiveBlock.id) ?? [];
}

function applyGutterInsert(
  blocks: Block[],
  targetRowId: string,
  edge: "before" | "after",
  options?: { id?: string }
): Block[] {
  const rows = buildBlockTree(blocks);
  const position = resolveRowPlacementPlan(rows, targetRowId, edge);
  if (!position) {
    throw new Error(`No insert position for row ${targetRowId} edge ${edge}`);
  }

  const id = options?.id ?? nextInsertId();
  const block = createEmptyBlock("text");
  block.id = `block-${id}`;
  block.props = { text: id };

  if (position.parentId) {
    block.parentId = position.parentId;
  }

  return insertBlockAtPlacement(blocks, rows, position, block);
}

function findRowIdByBlockId(blocks: Block[], blockId: string): string {
  const rows = buildBlockTree(blocks);
  const match = flattenRows(rows).find(
    (row) => row.effectiveBlock.id === blockId
  );
  if (!match) {
    throw new Error(`Row not found for block ${blockId}`);
  }
  return match.rowId;
}

describe("gutter insert scenarios", () => {
  const canvasServerBlocks: Block[] = [
    {
      id: "hero",
      type: "heading",
      props: { level: 1, text: "Hero" },
    },
    {
      id: "bio",
      type: "text",
      props: { text: "Bio" },
    },
  ];

  beforeEach(() => {
    resetInsertCounter();
  });

  describe("canvas top-level", () => {
    it("click (after) on last server row inserts after it", () => {
      let blocks = [...canvasServerBlocks];
      const targetRowId = findRowIdByBlockId(blocks, "bio");

      blocks = applyGutterInsert(blocks, targetRowId, "after");

      expect(topLevelBlockIds(buildBlockTree(blocks))).toEqual([
        "hero",
        "bio",
        "block-insert-1",
      ]);
    });

    it("option-click (before) on middle server row inserts before it", () => {
      let blocks = [...canvasServerBlocks];
      const targetRowId = findRowIdByBlockId(blocks, "bio");

      blocks = applyGutterInsert(blocks, targetRowId, "before");

      expect(topLevelBlockIds(buildBlockTree(blocks))).toEqual([
        "hero",
        "block-insert-1",
        "bio",
      ]);
    });

    it("repeated clicks (after) on same row insert directly below it each time", () => {
      let blocks = [...canvasServerBlocks];
      const targetRowId = findRowIdByBlockId(blocks, "bio");

      for (const id of ["a", "b", "c"]) {
        blocks = applyGutterInsert(blocks, targetRowId, "after", { id });
      }

      expect(topLevelBlockIds(buildBlockTree(blocks))).toEqual([
        "hero",
        "bio",
        "block-c",
        "block-b",
        "block-a",
      ]);
    });

    it("repeated option-clicks (before) on same row stack above it", () => {
      let blocks = [...canvasServerBlocks];
      const targetRowId = findRowIdByBlockId(blocks, "bio");

      for (const id of ["a", "b", "c"]) {
        blocks = applyGutterInsert(blocks, targetRowId, "before", { id });
      }

      expect(topLevelBlockIds(buildBlockTree(blocks))).toEqual([
        "hero",
        "block-a",
        "block-b",
        "block-c",
        "bio",
      ]);
    });

    it("click (after) on last user row appends after it", () => {
      let blocks: Block[] = [
        ...canvasServerBlocks,
        {
          id: "note-block",
          type: "text",
          props: { text: "Note" },
        },
      ];

      const targetRowId = findRowIdByBlockId(blocks, "note-block");

      blocks = applyGutterInsert(blocks, targetRowId, "after");

      expect(topLevelBlockIds(buildBlockTree(blocks))).toEqual([
        "hero",
        "bio",
        "note-block",
        "block-insert-1",
      ]);
    });

    it("option-click (before) on user row between user rows uses immediate predecessor", () => {
      let blocks: Block[] = [
        ...canvasServerBlocks,
        {
          id: "note-a-block",
          type: "text",
          props: { text: "A" },
        },
        {
          id: "note-b-block",
          type: "text",
          props: { text: "B" },
        },
      ];

      const targetRowId = findRowIdByBlockId(blocks, "note-b-block");

      blocks = applyGutterInsert(blocks, targetRowId, "before");

      expect(topLevelBlockIds(buildBlockTree(blocks))).toEqual([
        "hero",
        "bio",
        "note-a-block",
        "block-insert-1",
        "note-b-block",
      ]);
    });

    it("click (after) on a middle empty row inserts below it only", () => {
      let blocks = [...canvasServerBlocks];
      const bioTargetRowId = findRowIdByBlockId(blocks, "bio");

      for (const id of ["a", "b", "c"]) {
        blocks = applyGutterInsert(blocks, bioTargetRowId, "after", { id });
      }

      const middleRowId = findRowIdByBlockId(blocks, "block-b");

      blocks = applyGutterInsert(blocks, middleRowId, "after", {
        id: "middle",
      });

      expect(topLevelBlockIds(buildBlockTree(blocks))).toEqual([
        "hero",
        "bio",
        "block-c",
        "block-b",
        "block-middle",
        "block-a",
      ]);
    });

    it("option-click (before) on a middle empty row inserts above it only", () => {
      let blocks = [...canvasServerBlocks];
      const bioTargetRowId = findRowIdByBlockId(blocks, "bio");

      for (const id of ["a", "b", "c"]) {
        blocks = applyGutterInsert(blocks, bioTargetRowId, "after", { id });
      }

      const middleRowId = findRowIdByBlockId(blocks, "block-b");

      blocks = applyGutterInsert(blocks, middleRowId, "before", {
        id: "middle",
      });

      expect(topLevelBlockIds(buildBlockTree(blocks))).toEqual([
        "hero",
        "bio",
        "block-c",
        "block-middle",
        "block-b",
        "block-a",
      ]);
    });

    it("option-click (before) first row inserts at page start", () => {
      let blocks = [...canvasServerBlocks];
      const targetRowId = findRowIdByBlockId(blocks, "hero");

      blocks = applyGutterInsert(blocks, targetRowId, "before");

      expect(topLevelBlockIds(buildBlockTree(blocks))).toEqual([
        "block-insert-1",
        "hero",
        "bio",
      ]);
    });
  });

  describe("list children", () => {
    const listServerBlocks: Block[] = [
      {
        id: "list-1",
        type: "list",
        props: { variant: "bullet" },
      },
      {
        id: "item-a",
        type: "text",
        parentId: "list-1",
        props: { text: "A" },
      },
      {
        id: "item-b",
        type: "text",
        parentId: "list-1",
        props: { text: "B" },
      },
    ];

    it("click (after) on list item inserts after it within the list", () => {
      let blocks = [...listServerBlocks];
      const targetRowId = findRowIdByBlockId(blocks, "item-a");

      blocks = applyGutterInsert(blocks, targetRowId, "after");

      expect(listChildBlockIds(buildBlockTree(blocks), "list-1")).toEqual([
        "item-a",
        "block-insert-1",
        "item-b",
      ]);
    });

    it("option-click (before) on list item inserts before it within the list", () => {
      let blocks = [...listServerBlocks];
      const targetRowId = findRowIdByBlockId(blocks, "item-b");

      blocks = applyGutterInsert(blocks, targetRowId, "before");

      expect(listChildBlockIds(buildBlockTree(blocks), "list-1")).toEqual([
        "item-a",
        "block-insert-1",
        "item-b",
      ]);
    });

    it("repeated clicks (after) on same list item insert directly below it each time", () => {
      let blocks = [...listServerBlocks];
      const targetRowId = findRowIdByBlockId(blocks, "item-a");

      for (const id of ["x", "y"]) {
        blocks = applyGutterInsert(blocks, targetRowId, "after", { id });
      }

      expect(listChildBlockIds(buildBlockTree(blocks), "list-1")).toEqual([
        "item-a",
        "block-y",
        "block-x",
        "item-b",
      ]);
    });

    it("repeated clicks (after) on last list item insert directly below it each time", () => {
      let blocks = [...listServerBlocks];
      const targetRowId = findRowIdByBlockId(blocks, "item-b");

      for (const id of ["x", "y"]) {
        blocks = applyGutterInsert(blocks, targetRowId, "after", { id });
      }

      expect(listChildBlockIds(buildBlockTree(blocks), "list-1")).toEqual([
        "item-a",
        "item-b",
        "block-y",
        "block-x",
      ]);
    });
  });
});
