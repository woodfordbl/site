import { describe, expect, it } from "vitest";

import { buildBlockTree, type CanvasRow } from "@/db/queries/merge-blocks.ts";
import { shouldDeferCanvasFocus } from "@/lib/canvas/apply-pending-focus.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("shouldDeferCanvasFocus", () => {
  it("defers when a top-level block is still rendered under a list row", () => {
    const listBlock: Block = {
      id: "list-1",
      type: "list",
      props: { variant: "bullet" },
    };
    const liftedText: Block = {
      id: "item-1",
      type: "text",
      parentId: null,
      props: { text: "Hello" },
    };
    const itemRow: CanvasRow = {
      rowId: "item-1",
      effectiveBlock: liftedText,
      sortOrder: 0,
      children: [],
    };
    const rows: CanvasRow[] = [
      {
        rowId: "list-1",
        effectiveBlock: listBlock,
        sortOrder: 0,
        children: [itemRow],
      },
    ];

    expect(shouldDeferCanvasFocus(rows, "item-1")).toBe(true);
  });

  it("does not defer for list children", () => {
    const blocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "bullet" } },
      {
        id: "item-1",
        type: "text",
        parentId: "list-1",
        props: { text: "Hello" },
      },
    ];
    const rows = buildBlockTree(blocks);

    expect(shouldDeferCanvasFocus(rows, "item-1")).toBe(false);
  });

  it("does not defer for top-level text rows", () => {
    const blocks: Block[] = [
      { id: "text-1", type: "text", props: { text: "Hello" } },
    ];
    const rows = buildBlockTree(blocks);

    expect(shouldDeferCanvasFocus(rows, "text-1")).toBe(false);
  });
});
