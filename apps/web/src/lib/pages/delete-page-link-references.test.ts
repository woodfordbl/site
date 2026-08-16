// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";

const mocks = vi.hoisted(() => ({
  applyPageBlockDiff: vi.fn(),
  loadPage: vi.fn(),
  persistPageMetadata: vi.fn(),
  readBlockShardForPage: vi.fn(),
  pagesToArray: vi.fn(() => [] as { id: string; blockOrder?: string[] }[]),
}));

vi.mock("@/db/queries/block-collection-ops.ts", () => ({
  applyPageBlockDiff: mocks.applyPageBlockDiff,
}));

vi.mock("@/lib/content/load-page.ts", () => ({
  loadPage: mocks.loadPage,
}));

vi.mock("@/lib/pages/persist-page-metadata.ts", () => ({
  persistPageMetadata: mocks.persistPageMetadata,
}));

vi.mock("@/db/collections/read-block-shard.ts", () => ({
  readBlockShardForPage: mocks.readBlockShardForPage,
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localPagesCollection: {
    get toArray() {
      return mocks.pagesToArray();
    },
  },
}));

vi.mock("@/lib/content/block-hash.ts", () => ({
  hashPageBlocks: () => "baseline-hash",
}));

import { deletePageLinkReferences } from "@/lib/pages/delete-page-link-references.ts";

function pageLink(id: string, pageId: string, parentId?: string): Block {
  return {
    id,
    type: "pageLink",
    props: { pageId, variant: "child" },
    ...(parentId ? { parentId } : {}),
  };
}

function text(id: string): Block {
  return { id, type: "text", props: { text: id } };
}

function local(block: Block, hostPageId: string): LocalBlock {
  return {
    ...block,
    pageId: hostPageId,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function summary(id: string): PageSummary {
  return { id, title: id, slug: `/${id}`, parentId: null, routeBy: "slug" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readBlockShardForPage.mockReturnValue([]);
  mocks.pagesToArray.mockReturnValue([]);
});

describe("deletePageLinkReferences", () => {
  it("removes a top-level pageLink that targets a deleted page from a local host", async () => {
    const host = "host";
    const blocks = [text("t1"), pageLink("link", "deleted"), text("t2")];
    mocks.readBlockShardForPage.mockImplementation((id: string) =>
      id === host ? blocks.map((block) => local(block, host)) : []
    );

    await deletePageLinkReferences(new Set(["deleted"]), [summary(host)]);

    expect(mocks.applyPageBlockDiff).toHaveBeenCalledTimes(1);
    const [pageIdArg, previous, next] = mocks.applyPageBlockDiff.mock.calls[0];
    expect(pageIdArg).toBe(host);
    expect((previous as Block[]).map((b) => b.id)).toEqual([
      "t1",
      "link",
      "t2",
    ]);
    expect((next as Block[]).map((b) => b.id)).toEqual(["t1", "t2"]);
  });

  it("removes a container-nested pageLink", async () => {
    const host = "host";
    const blocks = [
      { id: "col", type: "columns", props: {} } as Block,
      pageLink("nested", "deleted", "col"),
      text("t2"),
    ];
    mocks.readBlockShardForPage.mockImplementation((id: string) =>
      id === host ? blocks.map((block) => local(block, host)) : []
    );

    await deletePageLinkReferences(new Set(["deleted"]), [summary(host)]);

    const next = mocks.applyPageBlockDiff.mock.calls[0][2] as Block[];
    expect(next.map((b) => b.id)).toEqual(["col", "t2"]);
  });

  it("skips host pages that are themselves being deleted", async () => {
    const host = "deleted-parent";
    mocks.readBlockShardForPage.mockImplementation((id: string) =>
      id === host ? [local(pageLink("link", "deleted-child"), host)] : []
    );

    await deletePageLinkReferences(
      new Set(["deleted-parent", "deleted-child"]),
      [summary("deleted-parent")]
    );

    expect(mocks.applyPageBlockDiff).not.toHaveBeenCalled();
  });

  it("leaves links that target surviving pages untouched", async () => {
    const host = "host";
    mocks.readBlockShardForPage.mockImplementation((id: string) =>
      id === host
        ? [local(text("t1"), host), local(pageLink("link", "alive"), host)]
        : []
    );

    await deletePageLinkReferences(new Set(["deleted"]), [summary(host)]);

    expect(mocks.applyPageBlockDiff).not.toHaveBeenCalled();
  });

  it("seeds a shipped, unseeded host with the cleaned content", async () => {
    const host = summary("shipped");
    mocks.readBlockShardForPage.mockReturnValue([]); // never edited locally
    mocks.loadPage.mockResolvedValue({
      blocks: [text("t1"), pageLink("link", "deleted")],
    });

    await deletePageLinkReferences(new Set(["deleted"]), [host]);

    expect(mocks.persistPageMetadata).toHaveBeenCalledTimes(1);
    const arg = mocks.persistPageMetadata.mock.calls[0][0] as {
      pageId: string;
      seed: { blocks: Block[]; serverBaselineHash: string };
    };
    expect(arg.pageId).toBe("shipped");
    expect(arg.seed.blocks.map((b) => b.id)).toEqual(["t1"]);
    expect(arg.seed.serverBaselineHash).toBe("baseline-hash");
  });

  it("does not seed a shipped host that has no matching links", async () => {
    const host = summary("shipped");
    mocks.readBlockShardForPage.mockReturnValue([]);
    mocks.loadPage.mockResolvedValue({
      blocks: [text("t1"), pageLink("link", "alive")],
    });

    await deletePageLinkReferences(new Set(["deleted"]), [host]);

    expect(mocks.persistPageMetadata).not.toHaveBeenCalled();
  });

  it("no-ops on an empty delete set", async () => {
    await deletePageLinkReferences(new Set(), [summary("host")]);
    expect(mocks.applyPageBlockDiff).not.toHaveBeenCalled();
    expect(mocks.loadPage).not.toHaveBeenCalled();
  });
});
