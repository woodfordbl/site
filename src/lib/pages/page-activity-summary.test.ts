import { describe, expect, it } from "vitest";

import { buildPageActivitySummary } from "@/lib/pages/page-activity-summary.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

describe("buildPageActivitySummary", () => {
  it("uses the latest block updatedAt for last edited", () => {
    const localPage: LocalPage = {
      id: "page-1",
      slug: "/notes",
      title: "Notes",
      parentId: null,
      serverBaselineHash: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };

    const blocks: Block[] = [
      {
        id: "block-1",
        type: "text",
        parentId: null,
        props: { text: "Hello there" },
      },
    ];

    const localBlocks: LocalBlock[] = [
      {
        ...blocks[0],
        pageId: "page-1",
        updatedAt: "2026-06-01T12:00:00.000Z",
      },
    ];

    const summary = buildPageActivitySummary({
      blocks,
      localBlocks,
      localPage,
    });

    expect(summary.lastEditedAt).toBe("2026-06-01T12:00:00.000Z");
    expect(summary.blockCount).toBe(1);
    expect(summary.wordCount).toBe(2);
  });
});
