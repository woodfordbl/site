/**
 * Fractional-index dual-write behavior of the block ops: every structural
 * edit persists `fractionalIndex` on the affected rows alongside the legacy
 * `blockOrder` mirror. Core transaction mechanics live in
 * block-collection-ops.test.ts.
 */
import { generateNKeysBetween } from "fractional-indexing";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";

const mocks = vi.hoisted(() => ({
  acceptBlockMutations: vi.fn(),
  acceptPageMutations: vi.fn(),
  blockDelete: vi.fn(),
  blockGet: vi.fn(),
  blockHas: vi.fn(),
  blockInsert: vi.fn(),
  blockUpdate: vi.fn(),
  commit: vi.fn(),
  createTransaction: vi.fn(),
  markPageDirty: vi.fn(),
  mutate: vi.fn(),
  pageHas: vi.fn(),
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
    get: mocks.blockGet,
    has: mocks.blockHas,
    insert: mocks.blockInsert,
    update: mocks.blockUpdate,
    utils: { acceptMutations: mocks.acceptBlockMutations },
  },
  localPagesCollection: {
    has: mocks.pageHas,
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

/** Point the collection mock at rows keyed by id (with or without indexes). */
function seedCollectionRows(rows: Map<string, LocalBlock>): void {
  mocks.blockGet.mockImplementation((id: string) => rows.get(id));
  mocks.blockHas.mockImplementation((id: string) => rows.has(id));
}

/** Existing indexed rows for `ids`; returns each id's fractional index. */
function seedIndexedRows(ids: string[]): Map<string, string> {
  const keys = generateNKeysBetween(null, null, ids.length);
  seedCollectionRows(
    new Map(
      ids.map((id, index) => [
        id,
        { ...localBlock(textBlock(id)), fractionalIndex: keys[index] },
      ])
    )
  );
  return new Map(ids.map((id, index) => [id, keys[index]]));
}

/** Capture every blockUpdate's resulting draft, seeded from the mocked row. */
function captureBlockUpdateDrafts(): Map<string, LocalBlock> {
  const drafts = new Map<string, LocalBlock>();
  mocks.blockUpdate.mockImplementation(
    (id: string, update: (draft: LocalBlock) => void) => {
      const draft: LocalBlock = {
        ...((mocks.blockGet(id) as LocalBlock | undefined) ??
          localBlock(textBlock(id))),
      };
      update(draft);
      drafts.set(id, draft);
      return draft;
    }
  );
  return drafts;
}

function insertedRows(): LocalBlock[] {
  return mocks.blockInsert.mock.calls.map((call) => call[0] as LocalBlock);
}

function isStrictlyIncreasing(keys: Array<string | undefined>): boolean {
  return keys.every(
    (key, index) =>
      typeof key === "string" &&
      (index === 0 || (keys[index - 1] as string) < key)
  );
}

function setupTransactionMock(): void {
  mocks.blockGet.mockReset();
  mocks.blockHas.mockReset();
  mocks.blockHas.mockReturnValue(false);
  mocks.pageHas.mockReset();
  mocks.pageHas.mockReturnValue(true);
  mocks.blockUpdate.mockReset();
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

describe("fractional index dual-write", () => {
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

  it("assigns the inserted block an index between its indexed neighbors", async () => {
    const {
      beginPageBlockTransaction,
      commitPageBlockTransaction,
      insertPageBlockAt,
    } = ops;
    const keys = seedIndexedRows(["a", "b", "c"]);

    const tx = beginPageBlockTransaction(pageId, ["a", "b", "c"]);
    insertPageBlockAt(pageId, textBlock("inserted"), 1, tx);
    commitPageBlockTransaction(tx);
    await flushAsync();

    const [inserted] = insertedRows();
    const insertedKey = inserted.fractionalIndex as string;
    expect(typeof insertedKey).toBe("string");
    expect(insertedKey > (keys.get("a") as string)).toBe(true);
    expect(insertedKey < (keys.get("b") as string)).toBe(true);
    // Neighbors keep their keys — no index rewrites.
    expect(mocks.blockUpdate).not.toHaveBeenCalled();
  });

  it("backfills every row's index on the first structural edit of a legacy page", async () => {
    const {
      beginPageBlockTransaction,
      commitPageBlockTransaction,
      insertPageBlockAt,
    } = ops;
    seedCollectionRows(
      new Map(["a", "b", "c"].map((id) => [id, localBlock(textBlock(id))]))
    );
    const drafts = captureBlockUpdateDrafts();

    const tx = beginPageBlockTransaction(pageId, ["a", "b", "c"]);
    insertPageBlockAt(pageId, textBlock("inserted"), 1, tx);
    commitPageBlockTransaction(tx);
    await flushAsync();

    expect([...drafts.keys()].sort()).toEqual(["a", "b", "c"]);
    const [inserted] = insertedRows();
    expect(
      isStrictlyIncreasing([
        drafts.get("a")?.fractionalIndex,
        inserted.fractionalIndex,
        drafts.get("b")?.fractionalIndex,
        drafts.get("c")?.fractionalIndex,
      ])
    ).toBe(true);
  });

  it("move-to-front rewrites only the moved block's index and keeps the legacy mirror", async () => {
    const {
      beginPageBlockTransaction,
      commitPageBlockTransaction,
      patchBlockOrder,
    } = ops;
    const keys = seedIndexedRows(["a", "b", "c"]);
    const drafts = captureBlockUpdateDrafts();

    const tx = beginPageBlockTransaction(pageId, ["a", "b", "c"]);
    patchBlockOrder(pageId, ["c", "a", "b"], tx);
    commitPageBlockTransaction(tx);
    await flushAsync();

    expect([...drafts.keys()]).toEqual(["c"]);
    expect(
      (drafts.get("c")?.fractionalIndex as string) < (keys.get("a") as string)
    ).toBe(true);
    // The legacy blockOrder mirror is still dual-written.
    expect(readBlockOrderFromUpdate()).toEqual(["c", "a", "b"]);
  });

  it("keeps survivors' indexes on delete", async () => {
    const {
      beginPageBlockTransaction,
      commitPageBlockTransaction,
      deletePageBlocksInTx,
    } = ops;
    seedIndexedRows(["a", "b", "c"]);

    const tx = beginPageBlockTransaction(pageId, ["a", "b", "c"]);
    deletePageBlocksInTx(pageId, ["b"], tx);
    commitPageBlockTransaction(tx);
    await flushAsync();

    expect(mocks.blockUpdate).not.toHaveBeenCalled();
  });

  it("carries a between-neighbors index on a diff insert", async () => {
    const { applyPageBlockDiff } = ops;
    const keys = seedIndexedRows(["a", "b"]);
    const previous = [textBlock("a"), textBlock("b")];
    const next = [textBlock("a"), textBlock("inserted"), textBlock("b")];

    applyPageBlockDiff(pageId, previous, next, [
      localBlock(textBlock("a")),
      localBlock(textBlock("b")),
    ]);
    await flushAsync();

    const [inserted] = insertedRows();
    const insertedKey = inserted.fractionalIndex as string;
    expect(insertedKey > (keys.get("a") as string)).toBe(true);
    expect(insertedKey < (keys.get("b") as string)).toBe(true);
    expect(mocks.blockUpdate).not.toHaveBeenCalled();
  });

  it("replacePageBlocks keeps consistent existing indexes and assigns one to the insert", async () => {
    const { replacePageBlocks } = ops;
    mocks.blockUpdate.mockImplementation(
      (blockId: string, update: (draft: LocalBlock) => void) => {
        const draft = localBlock(textBlock(blockId));
        update(draft);
        return draft;
      }
    );
    const keys = generateNKeysBetween(null, null, 2);
    const existing = [
      { ...localBlock(textBlock("hero")), fractionalIndex: keys[0] },
      { ...localBlock(textBlock("bio")), fractionalIndex: keys[1] },
    ];

    replacePageBlocks(
      pageId,
      [textBlock("hero"), textBlock("inserted"), textBlock("bio")],
      existing
    );
    await flushAsync();

    const [inserted] = insertedRows();
    const insertedKey = inserted.fractionalIndex as string;
    expect(insertedKey > keys[0]).toBe(true);
    expect(insertedKey < keys[1]).toBe(true);
  });
});

describe("seedPageBlocks", () => {
  let ops: typeof import("@/db/queries/block-collection-ops.ts");

  beforeAll(async () => {
    ops = await import("@/db/queries/block-collection-ops.ts");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupTransactionMock();
  });

  it("assigns strictly increasing initial indexes in the given order", async () => {
    ops.seedPageBlocks(pageId, [
      textBlock("a"),
      textBlock("b"),
      textBlock("c"),
    ]);
    await flushAsync();

    const rows = insertedRows();
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(isStrictlyIncreasing(rows.map((row) => row.fractionalIndex))).toBe(
      true
    );
  });

  it("skips rows that already exist without re-seeding their index", async () => {
    mocks.blockHas.mockImplementation((id: string) => id === "a");

    ops.seedPageBlocks(pageId, [textBlock("a"), textBlock("b")]);
    await flushAsync();

    const rows = insertedRows();
    expect(rows.map((row) => row.id)).toEqual(["b"]);
    expect(typeof rows[0].fractionalIndex).toBe("string");
  });
});
