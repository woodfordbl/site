import { describe, expect, it } from "vitest";

import {
  buildPageActivitySummary,
  resolvePageLastEditedAt,
} from "@/lib/pages/page-activity-summary.ts";
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

  it("reports shipped timestamps for a page with no local row", () => {
    const summary = buildPageActivitySummary({
      blocks: [],
      localPage: null,
      serverPage: {
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    });

    expect(summary.createdAt).toBe("2026-02-01T00:00:00.000Z");
    expect(summary.lastEditedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("reports nothing when neither shipped nor local timestamps exist", () => {
    const summary = buildPageActivitySummary({
      blocks: [],
      localPage: null,
      serverPage: {},
    });

    expect(summary.createdAt).toBeNull();
    expect(summary.lastEditedAt).toBeNull();
  });

  it("prefers the shipped createdAt over a later lazy-seed createdAt", () => {
    const summary = buildPageActivitySummary({
      blocks: [],
      localPage: {
        id: "home",
        slug: "/",
        title: "Home",
        parentId: null,
        serverBaselineHash: "hash",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      serverPage: { createdAt: "2026-01-01T00:00:00.000Z" },
    });

    expect(summary.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("prefers a local block updatedAt over an older shipped updatedAt", () => {
    const localPage: LocalPage = {
      id: "home",
      slug: "/",
      title: "Home",
      parentId: null,
      serverBaselineHash: "hash",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };

    const block: Block = {
      id: "block-1",
      type: "text",
      parentId: null,
      props: { text: "Edited" },
    };

    const summary = buildPageActivitySummary({
      blocks: [block],
      localBlocks: [
        { ...block, pageId: "home", updatedAt: "2026-07-15T00:00:00.000Z" },
      ],
      localPage,
      serverPage: { updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    expect(summary.lastEditedAt).toBe("2026-07-15T00:00:00.000Z");
  });

  it("keeps the shipped updatedAt when it is newer than every local edit", () => {
    const summary = buildPageActivitySummary({
      blocks: [],
      localPage: {
        id: "home",
        slug: "/",
        title: "Home",
        parentId: null,
        serverBaselineHash: "hash",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      serverPage: { updatedAt: "2026-05-01T00:00:00.000Z" },
    });

    expect(summary.lastEditedAt).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("resolvePageLastEditedAt", () => {
  it("falls back to the shipped updatedAt with no local state", () => {
    expect(
      resolvePageLastEditedAt({
        localPage: null,
        serverPage: { updatedAt: "2026-04-01T00:00:00.000Z" },
      })
    ).toBe("2026-04-01T00:00:00.000Z");
  });

  it("returns null when no timestamps are available", () => {
    expect(resolvePageLastEditedAt({ localPage: null })).toBeNull();
  });
});
