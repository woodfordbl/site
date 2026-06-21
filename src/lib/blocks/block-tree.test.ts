import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import type { Block } from "@/lib/schemas/block.ts";

const serverBlocks: Block[] = [
  {
    id: "hero",
    type: "heading",
    props: { level: 1, text: "Hello" },
  },
  {
    id: "bio",
    type: "text",
    props: { text: "Bio" },
  },
];

describe("buildBlockTree", () => {
  it("returns rows in document order", () => {
    const rows = buildBlockTree(serverBlocks);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.effectiveBlock.props).toEqual({
      level: 1,
      text: "Hello",
    });
    expect(rows[0]?.children).toEqual([]);
    expect(rows.map((row) => row.rowId)).toEqual(["hero", "bio"]);
  });

  it("builds nested list children from flat blocks", () => {
    const listBlocks: Block[] = [
      {
        id: "list-1",
        type: "list",
        props: { variant: "bullet" },
      },
      {
        id: "item-a",
        type: "text",
        parentId: "list-1",
        props: { text: "A" },
      },
      {
        id: "item-between",
        type: "text",
        parentId: "list-1",
        props: { text: "Between" },
      },
      {
        id: "item-b",
        type: "text",
        parentId: "list-1",
        props: { text: "B" },
      },
    ];

    const rows = buildBlockTree(listBlocks);
    expect(rows[0]?.children.map((child) => child.effectiveBlock.id)).toEqual([
      "item-a",
      "item-between",
      "item-b",
    ]);
  });
});
