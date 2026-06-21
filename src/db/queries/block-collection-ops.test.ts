import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";

const mocks = vi.hoisted(() => ({
  acceptBlockMutations: vi.fn(),
  acceptPageMutations: vi.fn(),
  blockDelete: vi.fn(),
  blockInsert: vi.fn(),
  blockUpdate: vi.fn(),
  commit: vi.fn(),
  createTransaction: vi.fn(),
  markPageDirty: vi.fn(),
  mutate: vi.fn(),
  pageUpdate: vi.fn(),
}));

vi.mock("@tanstack/react-db", () => ({
  createTransaction: mocks.createTransaction,
}));

vi.mock("@/lib/local-draft/dirty-pages-cookie.ts", () => ({
  markPageDirty: mocks.markPageDirty,
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

function flushAsync(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const pageId = "page-1";

function textBlock(id: string, text = id): Block {
  return { id, type: "text", props: { text } };
}

function localBlock(block: Block): LocalBlock {
  return { ...block, pageId, updatedAt: "2026-01-01T00:00:00.000Z" };
}

function readBlockOrderFromUpdate(callIndex = 0): string[] | undefined {
  const updatePage = mocks.pageUpdate.mock.calls[callIndex]?.[1] as
    | ((draft: { blockOrder?: string[]; updatedAt?: string }) => void)
    | undefined;
  if (!updatePage) {
    return;
  }

  const draft: { blockOrder?: string[]; updatedAt?: string } = {};
  updatePage(draft);
  return draft.blockOrder;
}

function setupTransactionMock(): void {
  mocks.createTransaction.mockImplementation(
    ({
      mutationFn,
    }: {
      mutationFn: (options: { transaction: unknown }) => Promise<void>;
    }) => {
      const tx = {
        commit: mocks.commit.mockImplementation(() =>
          Promise.resolve(mutationFn({ transaction: { id: "tx-1" } }))
        ),
        mutate: mocks.mutate.mockImplementation((callback: () => void) =>
          callback()
        ),
      };
      return tx;
    }
  );
}

describe("incremental page block transaction", () => {
  let ops: typeof import("@/db/queries/block-collection-ops.ts");

  beforeAll(async () => {
    ops = await import("@/db/queries/block-collection-ops.ts");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupTransactionMock();
    mocks.pageUpdate.mockImplementation(
      (_pageId: string, update: (draft: { blockOrder?: string[] }) => void) => {
        const draft: { blockOrder?: string[]; updatedAt?: string } = {};
        update(draft);
        return draft;
      }
    );
  });

  it("inserts at middle index with correct block order splice", async () => {
    const {
      beginPageBlockTransaction,
      commitPageBlockTransaction,
      insertPageBlockAt,
    } = ops;

    const tx = beginPageBlockTransaction(pageId, ["a", "b", "c"]);
    insertPageBlockAt(pageId, textBlock("inserted"), 1, tx);
    commitPageBlockTransaction(tx);
    await flushAsync();

    expect(tx.blockOrder).toEqual(["a", "inserted", "b", "c"]);
    expect(mocks.blockInsert).toHaveBeenCalledTimes(1);
    expect(readBlockOrderFromUpdate()).toEqual(["a", "inserted", "b", "c"]);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.markPageDirty).toHaveBeenCalledTimes(1);
  });

  it("deletes blocks and strips ids from block order", async () => {
    const {
      beginPageBlockTransaction,
      commitPageBlockTransaction,
      deletePageBlocksInTx,
    } = ops;

    const tx = beginPageBlockTransaction(pageId, ["a", "b", "c"]);
    deletePageBlocksInTx(pageId, ["b"], tx);
    commitPageBlockTransaction(tx);
    await flushAsync();

    expect(tx.blockOrder).toEqual(["a", "c"]);
    expect(mocks.blockDelete).toHaveBeenCalledWith("b");
    expect(readBlockOrderFromUpdate()).toEqual(["a", "c"]);
  });

  it("deletes subtree ids from block order", async () => {
    const {
      beginPageBlockTransaction,
      commitPageBlockTransaction,
      deletePageBlocksInTx,
    } = ops;

    const tx = beginPageBlockTransaction(pageId, [
      "list-1",
      "item-a",
      "item-b",
      "tail",
    ]);
    deletePageBlocksInTx(pageId, ["list-1", "item-a", "item-b"], tx);
    commitPageBlockTransaction(tx);
    await flushAsync();

    expect(tx.blockOrder).toEqual(["tail"]);
    expect(mocks.blockDelete).toHaveBeenCalledTimes(3);
  });

  it("persists and inserts in one transaction with one commit", async () => {
    const {
      applyPageBlockDiff,
      beginPageBlockTransaction,
      commitPageBlockTransaction,
      updatePageBlockInTx,
      insertPageBlockAt,
    } = ops;

    const previous = [textBlock("a", "before"), textBlock("b")];
    const next = [
      textBlock("a", "after"),
      textBlock("inserted"),
      textBlock("b"),
    ];
    const tx = beginPageBlockTransaction(
      pageId,
      previous.map((block) => block.id)
    );

    updatePageBlockInTx(pageId, textBlock("a", "after"), true, tx);
    insertPageBlockAt(pageId, textBlock("inserted"), 1, tx);
    commitPageBlockTransaction(tx);
    await flushAsync();

    expect(mocks.blockUpdate).toHaveBeenCalledWith("a", expect.any(Function));
    expect(mocks.blockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inserted", pageId })
    );
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.markPageDirty).toHaveBeenCalledTimes(1);
    expect(readBlockOrderFromUpdate()).toEqual(["a", "inserted", "b"]);

    mocks.commit.mockClear();
    mocks.markPageDirty.mockClear();

    applyPageBlockDiff(pageId, previous, next, [
      localBlock(textBlock("a", "before")),
      localBlock(textBlock("b")),
    ]);
    await flushAsync();

    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.markPageDirty).toHaveBeenCalledTimes(1);
  });

  it("re-inserts with insert after delete in the same transaction", async () => {
    const {
      beginPageBlockTransaction,
      commitPageBlockTransaction,
      deletePageBlocksInTx,
      insertPageBlockAt,
    } = ops;

    const deletedInTransaction = new Set<string>();
    const tx = beginPageBlockTransaction(
      pageId,
      ["list-1", "item-a", "item-b"],
      deletedInTransaction
    );

    deletePageBlocksInTx(pageId, ["item-b"], tx);
    insertPageBlockAt(pageId, textBlock("item-b", ""), 2, tx);
    commitPageBlockTransaction(tx);
    await flushAsync();

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

describe("applyPageBlockDiff", () => {
  let ops: typeof import("@/db/queries/block-collection-ops.ts");

  beforeAll(async () => {
    ops = await import("@/db/queries/block-collection-ops.ts");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupTransactionMock();
    mocks.pageUpdate.mockImplementation(
      (_pageId: string, update: (draft: { blockOrder?: string[] }) => void) => {
        const draft: { blockOrder?: string[]; updatedAt?: string } = {};
        update(draft);
        return draft;
      }
    );
  });

  it("inserts only the new block and updates block order", async () => {
    const { applyPageBlockDiff } = ops;
    const previous = [textBlock("a"), textBlock("b")];
    const next = [textBlock("a"), textBlock("inserted"), textBlock("b")];

    applyPageBlockDiff(pageId, previous, next, [
      localBlock(textBlock("a")),
      localBlock(textBlock("b")),
    ]);
    await flushAsync();

    expect(mocks.blockInsert).toHaveBeenCalledTimes(1);
    expect(mocks.blockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inserted", pageId })
    );
    expect(mocks.blockDelete).not.toHaveBeenCalled();
    expect(mocks.blockUpdate).not.toHaveBeenCalled();
    expect(readBlockOrderFromUpdate()).toEqual(["a", "inserted", "b"]);
  });

  it("deletes only the removed block and updates block order", async () => {
    const { applyPageBlockDiff } = ops;
    const previous = [textBlock("a"), textBlock("b"), textBlock("c")];
    const next = [textBlock("a"), textBlock("c")];

    applyPageBlockDiff(pageId, previous, next, [
      localBlock(textBlock("a")),
      localBlock(textBlock("b")),
      localBlock(textBlock("c")),
    ]);
    await flushAsync();

    expect(mocks.blockDelete).toHaveBeenCalledTimes(1);
    expect(mocks.blockDelete).toHaveBeenCalledWith("b");
    expect(mocks.blockInsert).not.toHaveBeenCalled();
    expect(mocks.blockUpdate).not.toHaveBeenCalled();
    expect(readBlockOrderFromUpdate()).toEqual(["a", "c"]);
  });

  it("queues diff mutations on an existing transaction without committing", () => {
    const { applyPageBlockDiff, beginPageBlockTransaction } = ops;
    const previous = [textBlock("a"), textBlock("b")];
    const next = [textBlock("a"), textBlock("inserted"), textBlock("b")];
    const tx = beginPageBlockTransaction(
      pageId,
      previous.map((block) => block.id)
    );

    applyPageBlockDiff(pageId, previous, next, [localBlock(textBlock("a"))], {
      tx,
    });

    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.blockInsert).toHaveBeenCalledTimes(1);
  });
});

describe("replacePageBlocks", () => {
  let ops: typeof import("@/db/queries/block-collection-ops.ts");

  beforeAll(async () => {
    ops = await import("@/db/queries/block-collection-ops.ts");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupTransactionMock();
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
    const { replacePageBlocks } = ops;
    const blocks = [textBlock("hero"), textBlock("inserted"), textBlock("bio")];

    replacePageBlocks(pageId, blocks, [
      localBlock(textBlock("hero")),
      localBlock(textBlock("bio")),
    ]);
    await flushAsync();

    expect(mocks.acceptPageMutations).toHaveBeenCalledTimes(1);
    expect(mocks.acceptBlockMutations).toHaveBeenCalledTimes(1);
    expect(mocks.pageUpdate).toHaveBeenCalledWith(pageId, expect.any(Function));
    expect(readBlockOrderFromUpdate()).toEqual(["hero", "inserted", "bio"]);
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
    const { replacePageBlocks } = ops;
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
    await flushAsync();

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
