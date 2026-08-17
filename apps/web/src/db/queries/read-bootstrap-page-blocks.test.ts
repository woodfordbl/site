// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";

const PAGE_ID = "about";
const SHARD_KEY = `site-local-blocks:${PAGE_ID}`;
const LOCAL_PAGES_KEY = "site-local-pages";

function storedBlock(id: string, text: string) {
  return {
    versionKey: `v-${id}`,
    data: {
      id,
      pageId: PAGE_ID,
      type: "text",
      props: { text },
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function writeLocalPage(blockOrder: string[]) {
  localStorage.setItem(
    LOCAL_PAGES_KEY,
    JSON.stringify({
      [PAGE_ID]: {
        versionKey: "v",
        data: {
          id: PAGE_ID,
          slug: "/about",
          title: "About",
          parentId: null,
          blockOrder,
          serverBaselineHash: "abc12345",
          serverMetadataBaseline: "meta1234",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    })
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("readBootstrapPageBlocks", () => {
  it("reports no local content when no shard exists", () => {
    expect(readBootstrapPageBlocks(PAGE_ID)).toEqual({
      blocks: [],
      hasLocal: false,
    });
  });

  it("orders local blocks by the page blockOrder", () => {
    localStorage.setItem(
      SHARD_KEY,
      JSON.stringify({
        b1: storedBlock("b1", "one"),
        b2: storedBlock("b2", "two"),
      })
    );
    writeLocalPage(["b2", "b1"]);

    const result = readBootstrapPageBlocks(PAGE_ID);

    expect(result.hasLocal).toBe(true);
    expect(result.blocks.map((block) => block.id)).toEqual(["b2", "b1"]);
  });

  it("returns shard blocks even without a stored blockOrder", () => {
    localStorage.setItem(
      SHARD_KEY,
      JSON.stringify({ b1: storedBlock("b1", "one") })
    );

    const result = readBootstrapPageBlocks(PAGE_ID);

    expect(result.hasLocal).toBe(true);
    expect(result.blocks).toHaveLength(1);
  });
});
