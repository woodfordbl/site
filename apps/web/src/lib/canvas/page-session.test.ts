import { describe, expect, it } from "vitest";

import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import {
  placementAfterRow,
  resolveRowPlacementPlan,
} from "@/lib/blocks/row-placement.ts";
import { CanvasPageSession } from "@/lib/canvas/page-session.ts";
import type { Block } from "@/lib/schemas/block.ts";

function topLevelIds(session: CanvasPageSession): string[] {
  return session.getRows().map((row) => row.effectiveBlock.id);
}

describe("CanvasPageSession", () => {
  const canvasServerBlocks: Block[] = [
    { id: "hero", type: "heading", props: { level: 1, text: "Hero" } },
    { id: "bio", type: "text", props: { text: "Bio" } },
  ];

  it("hydrates blocks in block order", () => {
    const session = CanvasPageSession.hydrate(canvasServerBlocks, [
      "bio",
      "hero",
    ]);

    expect(session.getBlocks().map((block) => block.id)).toEqual([
      "bio",
      "hero",
    ]);
  });

  it("inserts after the last row at the end of the page", () => {
    const session = CanvasPageSession.hydrate(canvasServerBlocks);
    const bioRow = session.getRows()[1];
    expect(bioRow).toBeDefined();
    if (!bioRow) {
      return;
    }

    const position = placementAfterRow(session.getRows(), bioRow.rowId);
    expect(position).toBeDefined();
    if (!position) {
      return;
    }

    const block = createEmptyBlock("text");
    block.id = "new-row";
    const { flatIndex } = session.insertBlock(position, block);

    expect(topLevelIds(session)).toEqual(["hero", "bio", "new-row"]);
    expect(flatIndex).toBe(2);
  });

  it("inserts after the same anchor row repeatedly in document order", () => {
    const session = CanvasPageSession.hydrate(canvasServerBlocks);
    const bioRow = session.getRows()[1];
    expect(bioRow).toBeDefined();
    if (!bioRow) {
      return;
    }

    for (const id of ["a", "b", "c"]) {
      const position = resolveRowPlacementPlan(
        session.getRows(),
        bioRow.rowId,
        "after"
      );
      expect(position).toBeDefined();
      if (!position) {
        return;
      }

      const block = createEmptyBlock("text");
      block.id = id;
      session.insertBlock(position, block);
    }

    expect(topLevelIds(session)).toEqual(["hero", "bio", "c", "b", "a"]);
  });

  it("deletes a row and returns removed ids", () => {
    const session = CanvasPageSession.hydrate(canvasServerBlocks);
    const removedIds = session.deleteBlock("bio");

    expect(removedIds).toEqual(["bio"]);
    expect(topLevelIds(session)).toEqual(["hero"]);
  });

  it("ensureTrailingBlank reuses the provided blank block id", () => {
    const session = CanvasPageSession.hydrate([
      { id: "hero", type: "text", props: { text: "Hero" } },
    ]);
    const blank = createEmptyBlock("text") as Extract<Block, { type: "text" }>;
    blank.id = "stable-blank";

    const first = session.ensureTrailingBlank({
      createBlankBlock: () => blank,
    });
    const second = session.ensureTrailingBlank({
      createBlankBlock: () => blank,
    });

    expect(first.changed).toBe(true);
    expect(first.inserted?.id).toBe("stable-blank");
    expect(second.changed).toBe(false);
    expect(topLevelIds(session)).toEqual(["hero", "stable-blank"]);
  });
});
