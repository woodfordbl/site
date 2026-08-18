/**
 * @fileoverview `createdAt` preservation on block writes, split from
 * block-collection-ops.test.ts to keep both files under the length cap.
 * Shares that file's mock shape: the collections module is mocked so each
 * assertion reads the exact collection call the op made.
 */

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
  /** Ids the collection currently holds — deletes skip anything absent. */
  presentBlockIds: new Set<string>(),
  /** Fractional index stored on each seeded row, read back by `get`. */
  seededIndexById: new Map<string, string>(),
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

function setupTransactionMock(): void {
  mocks.blockGet.mockReset();
  mocks.blockGet.mockImplementation((id: string) =>
    mocks.presentBlockIds.has(id)
      ? { id, fractionalIndex: mocks.seededIndexById.get(id) }
      : undefined
  );
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

describe("block createdAt on update", () => {
  let ops: typeof import("@/db/queries/block-collection-ops.ts");

  beforeAll(async () => {
    ops = await import("@/db/queries/block-collection-ops.ts");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.presentBlockIds.clear();
    mocks.seededIndexById.clear();
    mocks.blockHas.mockImplementation((id: string) =>
      mocks.presentBlockIds.has(id)
    );
    setupTransactionMock();
    mocks.pageUpdate.mockImplementation(
      (_pageId: string, update: (draft: { blockOrder?: string[] }) => void) => {
        const draft: { blockOrder?: string[]; updatedAt?: string } = {};
        update(draft);
        return draft;
      }
    );
  });

  function captureUpdatedDraft(
    seedCreatedAt?: string
  ): { createdAt?: string }[] {
    const captured: { createdAt?: string }[] = [];
    mocks.blockUpdate.mockImplementation(
      (
        id: string,
        update: (draft: LocalBlock & { createdAt?: string }) => void
      ) => {
        const draft: LocalBlock & { createdAt?: string } = {
          ...localBlock(textBlock(id)),
          createdAt: seedCreatedAt,
        };
        update(draft);
        captured.push(draft);
        return draft;
      }
    );
    return captured;
  }

  it("preserves an existing createdAt when a block is edited", async () => {
    const { applyPageBlockDiff } = ops;
    const captured = captureUpdatedDraft("2025-01-01T00:00:00.000Z");

    applyPageBlockDiff(
      pageId,
      [textBlock("a", "before")],
      [textBlock("a", "after")],
      [localBlock(textBlock("a", "before"))]
    );
    await flushAsync();

    expect(mocks.blockUpdate).toHaveBeenCalledWith("a", expect.any(Function));
    expect(captured[0]?.createdAt).toBe("2025-01-01T00:00:00.000Z");
  });

  it("backfills createdAt for a legacy row missing the field", async () => {
    const { applyPageBlockDiff } = ops;
    const captured = captureUpdatedDraft(undefined);

    applyPageBlockDiff(
      pageId,
      [textBlock("a", "before")],
      [textBlock("a", "after")],
      [localBlock(textBlock("a", "before"))]
    );
    await flushAsync();

    expect(typeof captured[0]?.createdAt).toBe("string");
  });
});
