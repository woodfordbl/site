import { describe, expect, it } from "vitest";

import { clampBlockIndent, getBlockIndent } from "@/lib/blocks/block-indent.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("block-indent", () => {
  it("clamps indent to 0–4", () => {
    expect(clampBlockIndent(-1)).toBe(0);
    expect(clampBlockIndent(10)).toBe(4);
  });

  it("reads indent from block", () => {
    const block: Block = {
      id: "p1",
      type: "text",
      indent: 2,
      props: { text: "" },
    };

    expect(getBlockIndent(block)).toBe(2);
  });
});
