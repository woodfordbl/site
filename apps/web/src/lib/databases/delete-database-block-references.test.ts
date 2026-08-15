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

import { deleteDatabaseBlockReferences } from "@/lib/databases/delete-database-block-references.ts";

function databaseBlock(
  id: string,
  databaseId: string,
  parentId?: string
): Block {
  return {
    id,
    type: "database",
    props: { databaseId },
    ...(parentId ? { parentId } : {}),
  };
}

function text(id: string, value = id): Block {
  return { id, type: "text", props: { text: value } };
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

describe("deleteDatabaseBlockReferences", () => {
  it("removes top-level database blocks across multiple local hosts", async () => {
    const hostA = "host-a";
    const hostB = "host-b";
    const blocksA = [text("t1"), databaseBlock("db-a", "deleted"), text("t2")];
    const blocksB = [databaseBlock("db-b", "deleted"), text("t3")];
    mocks.readBlockShardForPage.mockImplementation((id: string) => {
      if (id === hostA) {
        return blocksA.map((block) => local(block, hostA));
      }
      if (id === hostB) {
        return blocksB.map((block) => local(block, hostB));
      }
      return [];
    });
    mocks.pagesToArray.mockReturnValue([
      { id: hostA, blockOrder: blocksA.map((block) => block.id) },
      { id: hostB, blockOrder: blocksB.map((block) => block.id) },
    ]);

    await deleteDatabaseBlockReferences("deleted", [
      summary(hostA),
      summary(hostB),
    ]);

    expect(mocks.applyPageBlockDiff).toHaveBeenCalledTimes(2);

    const callA = mocks.applyPageBlockDiff.mock.calls.find(
      (call) => call[0] === hostA
    );
    expect(callA).toBeDefined();
    expect((callA?.[2] as Block[]).map((block) => block.id)).toEqual([
      "t1",
      "t2",
      expect.any(String),
    ]);
    expect((callA?.[2] as Block[]).at(-1)?.type).toBe("text");

    const callB = mocks.applyPageBlockDiff.mock.calls.find(
      (call) => call[0] === hostB
    );
    expect(callB).toBeDefined();
    expect((callB?.[2] as Block[]).map((block) => block.id)).toEqual([
      "t3",
      expect.any(String),
    ]);
  });

  it("removes a container-nested database block", async () => {
    const host = "host";
    const blocks: Block[] = [
      { id: "cols", type: "columns", props: {} },
      { id: "col-a", type: "column", props: { width: 1 }, parentId: "cols" },
      databaseBlock("nested", "deleted", "col-a"),
      text("t2"),
    ];
    mocks.readBlockShardForPage.mockImplementation((id: string) =>
      id === host ? blocks.map((block) => local(block, host)) : []
    );

    await deleteDatabaseBlockReferences("deleted", [summary(host)]);

    const next = mocks.applyPageBlockDiff.mock.calls[0][2] as Block[];
    expect(next.map((block) => block.id)).toEqual([
      "cols",
      "col-a",
      "t2",
      expect.any(String),
    ]);
    expect(next.some((block) => block.id === "nested")).toBe(false);
  });

  it("replaces a sole database block with an empty text row", async () => {
    const host = "host";
    const blocks = [databaseBlock("only", "deleted")];
    mocks.readBlockShardForPage.mockImplementation((id: string) =>
      id === host ? blocks.map((block) => local(block, host)) : []
    );
    mocks.pagesToArray.mockReturnValue([{ id: host, blockOrder: ["only"] }]);

    await deleteDatabaseBlockReferences("deleted", [summary(host)]);

    expect(mocks.applyPageBlockDiff).toHaveBeenCalledTimes(1);
    const [pageIdArg, previous, next] = mocks.applyPageBlockDiff.mock.calls[0];
    expect(pageIdArg).toBe(host);
    expect((previous as Block[]).map((block) => block.id)).toEqual(["only"]);
    expect((next as Block[]).length).toBe(1);
    expect((next as Block[])[0]?.type).toBe("text");
    expect((next as Block[])[0]?.id).not.toBe("only");
  });

  it("leaves blocks that reference surviving databases untouched", async () => {
    const host = "host";
    mocks.readBlockShardForPage.mockImplementation((id: string) =>
      id === host
        ? [
            local(text("t1"), host),
            local(databaseBlock("alive", "other"), host),
          ]
        : []
    );

    await deleteDatabaseBlockReferences("deleted", [summary(host)]);

    expect(mocks.applyPageBlockDiff).not.toHaveBeenCalled();
  });

  it("seeds a shipped, unseeded host with the cleaned content", async () => {
    const host = summary("shipped");
    mocks.readBlockShardForPage.mockReturnValue([]);
    mocks.loadPage.mockResolvedValue({
      blocks: [text("t1"), databaseBlock("link", "deleted")],
    });

    await deleteDatabaseBlockReferences("deleted", [host]);

    expect(mocks.persistPageMetadata).toHaveBeenCalledTimes(1);
    const arg = mocks.persistPageMetadata.mock.calls[0][0] as {
      pageId: string;
      seed: { blocks: Block[]; serverBaselineHash: string };
    };
    expect(arg.pageId).toBe("shipped");
    expect(arg.seed.blocks.map((block) => block.type)).toEqual([
      "text",
      "text",
    ]);
    expect(arg.seed.blocks[0]?.id).toBe("t1");
    expect(arg.seed.serverBaselineHash).toBe("baseline-hash");
  });

  it("does not seed a shipped host that has no matching blocks", async () => {
    const host = summary("shipped");
    mocks.readBlockShardForPage.mockReturnValue([]);
    mocks.loadPage.mockResolvedValue({
      blocks: [text("t1"), databaseBlock("link", "alive")],
    });

    await deleteDatabaseBlockReferences("deleted", [host]);

    expect(mocks.persistPageMetadata).not.toHaveBeenCalled();
  });

  it("no-ops on an empty database id", async () => {
    await deleteDatabaseBlockReferences("", [summary("host")]);
    expect(mocks.applyPageBlockDiff).not.toHaveBeenCalled();
    expect(mocks.loadPage).not.toHaveBeenCalled();
  });
});
