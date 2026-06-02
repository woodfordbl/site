import { describe, expect, it } from "vitest";

import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("clonePageBlocks", () => {
  it("remaps parentId within the cloned set", () => {
    const listParent: Block = {
      id: "list-1",
      type: "list",
      indent: 0,
      parentId: null,
      props: { variant: "bullet" },
    };
    const listChild: Block = {
      id: "text-1",
      type: "text",
      indent: 0,
      parentId: "list-1",
      props: { text: "item" },
    };

    const cloned = clonePageBlocks([listParent, listChild]);
    const clonedParent = cloned.find((block) => block.type === "list");
    const clonedChild = cloned.find((block) => block.type === "text");

    expect(clonedParent).toBeDefined();
    expect(clonedChild).toBeDefined();
    expect(clonedParent?.id).not.toBe("list-1");
    expect(clonedChild?.id).not.toBe("text-1");
    expect(clonedChild?.parentId).toBe(clonedParent?.id);
  });
});
