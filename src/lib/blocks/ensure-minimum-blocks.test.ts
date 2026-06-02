import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/db/queries/merge-blocks.ts";
import {
  isLegacyEditorBlockId,
  normalizeEditablePageBlocks,
  rewriteLegacyEditorBlockIds,
} from "@/lib/blocks/ensure-minimum-blocks.ts";
import { exportPageBlocks } from "@/lib/content/page-export.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("isLegacyEditorBlockId", () => {
  it("matches old sentinel and relocated ids", () => {
    expect(isLegacyEditorBlockId("page-1-minimum")).toBe(true);
    expect(isLegacyEditorBlockId("page-1-trailing")).toBe(true);
    expect(isLegacyEditorBlockId("page-1-minimum-relocated")).toBe(true);
    expect(isLegacyEditorBlockId("page-1-trailing-relocated")).toBe(true);
    expect(isLegacyEditorBlockId("p1")).toBe(false);
  });
});

describe("rewriteLegacyEditorBlockIds", () => {
  it("replaces sentinel ids and parent references", () => {
    const blocks: Block[] = [
      {
        id: "page-1-trailing",
        type: "text",
        props: { text: "" },
      },
      {
        id: "child-1",
        type: "text",
        parentId: "page-1-trailing",
        props: { text: "nested" },
      },
    ];

    const result = rewriteLegacyEditorBlockIds(blocks);
    expect(result[0]?.id).not.toBe("page-1-trailing");
    expect(result[1]?.parentId).toBe(result[0]?.id);
  });
});

describe("normalizeEditablePageBlocks", () => {
  it("inserts a normal empty text block when the editable page has no blocks", () => {
    const result = normalizeEditablePageBlocks([], {
      createBlankBlock: () => ({
        id: "blank-1",
        type: "text",
        props: { text: "" },
      }),
    });

    expect(result.changed).toBe(true);
    expect(result.blocks).toEqual([
      { id: "blank-1", type: "text", props: { text: "" } },
    ]);
  });

  it("rewrites legacy ids before appending a trailing row", () => {
    const result = normalizeEditablePageBlocks(
      [
        {
          id: "page-1-minimum",
          type: "text",
          props: { text: "Hello" },
        },
      ],
      {
        createBlankBlock: () => ({
          id: "blank-1",
          type: "text",
          props: { text: "" },
        }),
      }
    );

    expect(result.changed).toBe(true);
    expect(result.blocks[0]?.id).not.toBe("page-1-minimum");
    expect(result.blocks[1]?.id).toBe("blank-1");
  });

  it("appends a normal trailing row after edited content", () => {
    const blocks: Block[] = [
      { id: "p1", type: "text", props: { text: "Hello" } },
    ];

    const result = normalizeEditablePageBlocks(blocks, {
      createBlankBlock: () => ({
        id: "blank-1",
        type: "text",
        props: { text: "" },
      }),
    });

    expect(result.changed).toBe(true);
    expect(result.blocks.map((block) => block.id)).toEqual(["p1", "blank-1"]);
  });

  it("preserves an existing user blank row at the end", () => {
    const blocks: Block[] = [
      { id: "p1", type: "text", props: { text: "Hello" } },
      { id: "p2", type: "text", props: { text: "" } },
    ];

    const result = normalizeEditablePageBlocks(blocks);

    expect(result.changed).toBe(false);
    expect(result.blocks).toBe(blocks);
  });
});

describe("exportPageBlocks", () => {
  it("exports all canvas rows as blocks", () => {
    const rows = buildBlockTree([
      { id: "p1", type: "text", props: { text: "Hello" } },
      { id: "blank-1", type: "text", props: { text: "" } },
    ]);

    expect(exportPageBlocks(rows)).toEqual([
      { id: "p1", type: "text", props: { text: "Hello" } },
      { id: "blank-1", type: "text", props: { text: "" } },
    ]);
  });
});
