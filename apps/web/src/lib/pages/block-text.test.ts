import { describe, expect, it } from "vitest";
import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import { formulaTokenMark } from "@/lib/blocks/inline-formula.ts";
import { getBlocksText, getBlockText } from "@/lib/pages/block-text.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { FORMULA_TOKEN_SENTINEL as S } from "@/lib/schemas/rich-text.ts";

/**
 * The human-readable / structural split: `getBlockText` projects inline formula
 * tokens for people and indexes, while `getTextFromBlock` keeps returning the
 * canonical stored string for readers that write text back.
 */

function textBlock(text: string, marks?: Block["props"]): Block {
  return {
    id: "b1",
    parentId: null,
    indent: 0,
    type: "text",
    props: { text, ...(marks ?? {}) },
  } as Block;
}

const TOKEN_BLOCK = textBlock(`We have ${S} open tasks.`, {
  marks: [formulaTokenMark(8, 'count(db("t"))')],
} as never);

describe("getBlockText", () => {
  it("projects a token to its value when one is supplied", () => {
    expect(getBlockText(TOKEN_BLOCK, new Map([[8, "12"]]))).toBe(
      "We have 12 open tasks."
    );
  });

  it("never returns a raw sentinel, even with no values", () => {
    const text = getBlockText(TOKEN_BLOCK);
    expect(text).not.toContain(S);
    expect(text).toBe("We have … open tasks.");
  });

  it("leaves a block with no tokens untouched", () => {
    expect(getBlockText(textBlock("Plain prose."))).toBe("Plain prose.");
  });

  it("returns empty for a block type with no text of its own", () => {
    const divider = {
      id: "d",
      parentId: null,
      indent: 0,
      type: "divider",
      props: {},
    } as Block;
    expect(getBlockText(divider)).toBe("");
  });
});

describe("getBlocksText", () => {
  it("projects across a page's blocks", () => {
    const blocks = [TOKEN_BLOCK, textBlock("Second line.")];
    expect(getBlocksText(blocks, new Map([[8, "12"]]))).toBe(
      "We have 12 open tasks.\nSecond line."
    );
  });
});

describe("getTextFromBlock stays canonical", () => {
  it("returns the stored string, sentinel and all", () => {
    // Structural readers (block conversion, link detection) must see exactly
    // what is stored — projecting here would bake a value into the document.
    expect(getTextFromBlock(TOKEN_BLOCK)).toContain(S);
  });
});
