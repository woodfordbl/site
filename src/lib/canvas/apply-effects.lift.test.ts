import { describe, expect, it, vi } from "vitest";

import { buildBlockTree } from "@/db/queries/merge-blocks.ts";
import {
  deleteBlockByRowId,
  insertBlockAtPlacement,
  moveBlockByRowId,
  updateBlockByRowId,
} from "@/lib/blocks/page-block-mutations.ts";
import { applyCanvasEffects } from "@/lib/canvas/apply-effects.ts";
import { canvasReducer } from "@/lib/canvas/reducer.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("applyCanvasEffects list lift", () => {
  it("calls setFocus after in-place lift effects", () => {
    const blocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "bullet" } },
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
        props: { text: "" },
      },
    ];
    const rows = buildBlockTree(blocks);
    const result = canvasReducer(
      { rows, serverBlocks: blocks },
      { type: "row.split", rowId: "item-b", start: 0, end: 0 }
    );

    let workingBlocks = [...blocks];
    let workingRows = rows;
    const setFocus = vi.fn();

    applyCanvasEffects(
      result.effects,
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
        saveAuthorPage: vi.fn(),
      },
      rows,
      setFocus
    );

    expect(setFocus).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: "item-b", placement: "start" })
    );
    expect(
      result.effects.some((e) => e.type === "delete" && e.rowId === "item-b")
    ).toBe(false);
    expect(
      result.effects.some((e) => e.type === "persist" && e.rowId === "item-b")
    ).toBe(true);
  });
});
