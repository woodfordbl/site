import { describe, expect, it } from "vitest";

import { countPageWords } from "@/lib/pages/page-word-count.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("countPageWords", () => {
  it("counts words across nested text blocks", () => {
    const blocks: Block[] = [
      {
        id: "1",
        type: "text",
        parentId: null,
        props: { text: "Hello world" },
      },
      {
        id: "2",
        type: "heading",
        parentId: null,
        props: { level: 1, text: "One two three" },
      },
      {
        id: "3",
        type: "divider",
        parentId: null,
        props: {},
      },
    ];

    expect(countPageWords(blocks)).toBe(5);
  });
});
