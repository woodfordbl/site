import { describe, expect, it } from "vitest";

import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import type { Block } from "@/lib/schemas/block.ts";

function textBlock(id: string): Block {
  return { ...createEmptyBlock("text"), id };
}

describe("orderBlocksByIds", () => {
  it("returns blocks unchanged when no order is provided", () => {
    const blocks = [textBlock("a"), textBlock("b")];
    expect(orderBlocksByIds(blocks, null)).toBe(blocks);
    expect(orderBlocksByIds(blocks, [])).toBe(blocks);
  });

  it("orders blocks by the given id order", () => {
    const blocks = [textBlock("a"), textBlock("b"), textBlock("c")];
    const ordered = orderBlocksByIds(blocks, ["c", "a", "b"]);
    expect(ordered.map((block) => block.id)).toEqual(["c", "a", "b"]);
  });

  it("appends blocks missing from the order after ordered ids", () => {
    const blocks = [textBlock("a"), textBlock("new"), textBlock("b")];
    const ordered = orderBlocksByIds(blocks, ["b", "a"]);
    expect(ordered.map((block) => block.id)).toEqual(["b", "a", "new"]);
  });

  it("skips order ids with no matching block", () => {
    const blocks = [textBlock("a")];
    const ordered = orderBlocksByIds(blocks, ["ghost", "a"]);
    expect(ordered.map((block) => block.id)).toEqual(["a"]);
  });
});
