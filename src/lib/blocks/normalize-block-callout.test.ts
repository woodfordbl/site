import { describe, expect, it } from "vitest";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { ensureCalloutMinimumChildren } from "@/lib/blocks/normalize-block.ts";

describe("callout normalize", () => {
  it("seeds an empty text child when a callout has no children", () => {
    const callout = createEmptyBlock("callout");
    callout.id = "callout";

    const result = ensureCalloutMinimumChildren([callout]);
    const seeded = result.find((block) => block.parentId === "callout");
    expect(seeded?.type).toBe("text");
  });

  it("leaves a callout that already has children untouched", () => {
    const callout = createEmptyBlock("callout");
    callout.id = "callout";
    const child = createEmptyBlock("text");
    child.id = "child";
    child.parentId = "callout";

    const input = [callout, child];
    const result = ensureCalloutMinimumChildren(input);
    expect(result).toBe(input);
  });
});
