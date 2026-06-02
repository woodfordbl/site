import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";

const mocks = vi.hoisted(() => ({
  acceptBlockMutations: vi.fn(),
  acceptPageMutations: vi.fn(),
  blockDelete: vi.fn(),
  blockInsert: vi.fn(),
  blockUpdate: vi.fn(),
  pageUpdate: vi.fn(),
}));

vi.mock("@tanstack/react-db", () => ({
  createTransaction: vi.fn(
    ({
      mutationFn,
    }: {
      mutationFn: (options: { transaction: unknown }) => Promise<void>;
    }) => ({
      commit: vi.fn(() =>
        Promise.resolve(mutationFn({ transaction: { id: "tx-1" } }))
      ),
      mutate: vi.fn((callback: () => void) => callback()),
    })
  ),
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localBlocksCollection: {
    delete: mocks.blockDelete,
    insert: mocks.blockInsert,
    update: mocks.blockUpdate,
    utils: { acceptMutations: mocks.acceptBlockMutations },
  },
  localPagesCollection: {
    update: mocks.pageUpdate,
    utils: { acceptMutations: mocks.acceptPageMutations },
  },
}));

const pageId = "page-1";

function textBlock(id: string, text = id): Block {
  return { id, type: "text", props: { text } };
}

function localBlock(block: Block): LocalBlock {
  return { ...block, pageId, updatedAt: "2026-01-01T00:00:00.000Z" };
}

describe("replacePageBlocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pageUpdate.mockImplementation(
      (_pageId: string, update: (draft: { blockOrder?: string[] }) => void) => {
        const draft: { blockOrder?: string[]; updatedAt?: string } = {};
        update(draft);
        return draft;
      }
    );
    mocks.blockUpdate.mockImplementation(
      (_blockId: string, update: (draft: LocalBlock) => void) => {
        const draft = localBlock(textBlock(_blockId));
        update(draft);
        return draft;
      }
    );
  });

  it("accepts page metadata and block row mutations in one structural transaction", async () => {
    const { replacePageBlocks } = await import(
      "@/db/queries/block-collection-ops.ts"
    );
    const blocks = [textBlock("hero"), textBlock("inserted"), textBlock("bio")];

    replacePageBlocks(pageId, blocks, [
      localBlock(textBlock("hero")),
      localBlock(textBlock("bio")),
    ]);
    await Promise.resolve();

    expect(mocks.acceptPageMutations).toHaveBeenCalledTimes(1);
    expect(mocks.acceptBlockMutations).toHaveBeenCalledTimes(1);
    expect(mocks.pageUpdate).toHaveBeenCalledWith(pageId, expect.any(Function));

    const updatePage = mocks.pageUpdate.mock.calls[0]?.[1] as
      | ((draft: { blockOrder?: string[]; updatedAt?: string }) => void)
      | undefined;
    expect(updatePage).toBeDefined();
    if (!updatePage) {
      return;
    }

    const draft: { blockOrder?: string[]; updatedAt?: string } = {};
    updatePage(draft);

    expect(draft.blockOrder).toEqual(["hero", "inserted", "bio"]);
    expect(mocks.blockUpdate).toHaveBeenCalledWith(
      "hero",
      expect.any(Function)
    );
    expect(mocks.blockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inserted", pageId })
    );
    expect(mocks.blockUpdate).toHaveBeenCalledWith("bio", expect.any(Function));
  });

  it("re-inserts with insert after delete in the same transaction", async () => {
    const { replacePageBlocks } = await import(
      "@/db/queries/block-collection-ops.ts"
    );
    const deletedInTransaction = new Set<string>();
    const existing = [
      localBlock(textBlock("list-1")),
      localBlock(textBlock("item-a", "A")),
      localBlock(textBlock("item-b", "")),
    ];

    replacePageBlocks(
      pageId,
      [textBlock("list-1"), textBlock("item-a", "A")],
      existing,
      { deletedInTransaction }
    );
    replacePageBlocks(
      pageId,
      [textBlock("list-1"), textBlock("item-a", "A"), textBlock("item-b", "")],
      existing,
      { deletedInTransaction }
    );
    await Promise.resolve();

    expect(mocks.blockDelete).toHaveBeenCalledTimes(1);
    expect(mocks.blockDelete).toHaveBeenCalledWith("item-b");
    expect(mocks.blockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-b", pageId })
    );
    expect(mocks.blockUpdate).not.toHaveBeenCalledWith(
      "item-b",
      expect.any(Function)
    );
  });
});
