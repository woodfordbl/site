import { describe, expect, it } from "vitest";

import { hashBlock } from "@/lib/content/block-hash.ts";
import type { Block } from "@/lib/schemas/block.ts";

const sample: Block = {
  id: "a",
  type: "text",
  props: { text: "hello" },
};

describe("hashBlock", () => {
  it("returns stable hash for same block", () => {
    expect(hashBlock(sample)).toBe(hashBlock({ ...sample }));
  });

  it("returns different hash when content changes", () => {
    const other: Block = { ...sample, props: { text: "world" } };
    expect(hashBlock(sample)).not.toBe(hashBlock(other));
  });
});
