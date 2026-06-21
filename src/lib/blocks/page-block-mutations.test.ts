import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { normalizeEditablePageBlocks } from "@/lib/blocks/ensure-minimum-blocks.ts";
import {
  deleteBlockByRowId,
  insertBlockAtPlacement,
  moveBlockByRowId,
  updateBlockByRowId,
} from "@/lib/blocks/page-block-mutations.ts";
import {
  placementAfterRow,
  resolveRowPlacementPlan,
} from "@/lib/blocks/row-placement.ts";
import type { Block } from "@/lib/schemas/block.ts";

function topLevelIds(blocks: Block[]): string[] {
  return buildBlockTree(blocks).map((row) => row.effectiveBlock.id);
}

describe("page-block-mutations", () => {
  const canvasServerBlocks: Block[] = [
    { id: "hero", type: "heading", props: { level: 1, text: "Hero" } },
    { id: "bio", type: "text", props: { text: "Bio" } },
  ];

  it("inserts after the last row at the end of the page", () => {
    const rows = buildBlockTree(canvasServerBlocks);
    const bioRow = rows[1];
    expect(bioRow).toBeDefined();
    if (!bioRow) {
      return;
    }

    const position = placementAfterRow(rows, bioRow.rowId);
    expect(position).toBeDefined();
    if (!position) {
      return;
    }

    const block = createEmptyBlock("text");
    block.id = "new-row";
    const next = insertBlockAtPlacement(
      canvasServerBlocks,
      rows,
      position,
      block
    );

    expect(topLevelIds(next)).toEqual(["hero", "bio", "new-row"]);
  });

  it("inserts after the same anchor row repeatedly in document order", () => {
    let blocks = [...canvasServerBlocks];
    const rows = buildBlockTree(blocks);
    const bioRow = rows[1];
    expect(bioRow).toBeDefined();
    if (!bioRow) {
      return;
    }

    for (const id of ["a", "b", "c"]) {
      const position = resolveRowPlacementPlan(
        buildBlockTree(blocks),
        bioRow.rowId,
        "after"
      );
      expect(position).toBeDefined();
      if (!position) {
        return;
      }

      const block = createEmptyBlock("text");
      block.id = id;
      blocks = insertBlockAtPlacement(
        blocks,
        buildBlockTree(blocks),
        position,
        block
      );
    }

    expect(topLevelIds(blocks)).toEqual(["hero", "bio", "c", "b", "a"]);
  });

  it("inserts before the final normal blank row without changing row order", () => {
    const blocks: Block[] = [
      { id: "hero", type: "text", props: { text: "Hero" } },
      { id: "blank", type: "text", props: { text: "" } },
    ];
    const rows = buildBlockTree(blocks);
    const position = resolveRowPlacementPlan(rows, "blank", "before");
    expect(position).toBeDefined();
    if (!position) {
      return;
    }

    const block = createEmptyBlock("text");
    block.id = "inserted";
    const next = insertBlockAtPlacement(blocks, rows, position, block);

    expect(topLevelIds(next)).toEqual(["hero", "inserted", "blank"]);
  });

  it("replaces a deleted final blank row with a normal blank row", () => {
    const blocks: Block[] = [
      { id: "hero", type: "text", props: { text: "Hero" } },
      { id: "blank", type: "text", props: { text: "" } },
    ];

    const deleted = deleteBlockByRowId(blocks, buildBlockTree(blocks), "blank");
    const normalized = normalizeEditablePageBlocks(deleted, {
      createBlankBlock: () => ({
        id: "replacement-blank",
        type: "text",
        props: { text: "" },
      }),
    });

    expect(normalized.changed).toBe(true);
    expect(topLevelIds(normalized.blocks)).toEqual([
      "hero",
      "replacement-blank",
    ]);
  });

  it("moves a row after another row", () => {
    let blocks: Block[] = [
      ...canvasServerBlocks,
      { id: "note-a", type: "text", props: { text: "A" } },
      { id: "note-b", type: "text", props: { text: "B" } },
    ];
    const rows = buildBlockTree(blocks);
    const position = resolveRowPlacementPlan(rows, "note-b", "after");
    expect(position).toBeDefined();
    if (!position) {
      return;
    }

    blocks = moveBlockByRowId(blocks, rows, "hero", position);
    expect(topLevelIds(blocks)).toEqual(["bio", "note-a", "note-b", "hero"]);
  });

  it("keeps block id when a trailing blank row is moved", () => {
    const trailingId = "trailing-blank";
    const blocks: Block[] = [
      { id: "p1", type: "text", props: { text: "Hello" } },
      { id: trailingId, type: "text", props: { text: "" } },
    ];
    const rows = buildBlockTree(blocks);
    const position = resolveRowPlacementPlan(rows, "p1", "before");
    expect(position).toBeDefined();
    if (!position) {
      return;
    }

    const next = moveBlockByRowId(blocks, rows, trailingId, position);
    expect(topLevelIds(next)).toEqual([trailingId, "p1"]);
  });

  it("inserts after the last list item even when trailing blank follows in flat order", () => {
    const listId = "list-1";
    const item1 = "item-1";
    const item2 = "item-2";

    let blocks = normalizeEditablePageBlocks(
      [
        { id: "intro", type: "text", props: { text: "intro" } },
        { id: listId, type: "list", props: { variant: "ordered" } },
        {
          id: item1,
          type: "text",
          parentId: listId,
          props: { text: "first item text" },
        },
      ],
      {
        createBlankBlock: () => ({
          id: "trailing-blank",
          type: "text",
          props: { text: "" },
        }),
      }
    ).blocks;

    blocks = updateBlockByRowId(blocks, item1, {
      id: item1,
      type: "text",
      parentId: listId,
      props: { text: "first item text" },
    });

    const item2Block = createEmptyBlock("text");
    item2Block.id = item2;
    item2Block.parentId = listId;
    item2Block.props = { text: "second item text" };
    blocks = insertBlockAtPlacement(
      blocks,
      buildBlockTree(blocks),
      { parentId: listId, anchorRowId: item1, edge: "after" },
      item2Block
    );

    blocks = updateBlockByRowId(blocks, item2, {
      id: item2,
      type: "text",
      parentId: listId,
      props: { text: "second item text" },
    });

    const newBlock = createEmptyBlock("text");
    newBlock.id = "item-3";
    const next = insertBlockAtPlacement(
      blocks,
      buildBlockTree(blocks),
      { parentId: listId, anchorRowId: item2, edge: "after" },
      newBlock
    );

    const listRow = buildBlockTree(next).find(
      (row) => row.effectiveBlock.id === listId
    );
    expect(listRow?.children.map((child) => child.effectiveBlock.id)).toEqual([
      item1,
      item2,
      "item-3",
    ]);
  });
});
