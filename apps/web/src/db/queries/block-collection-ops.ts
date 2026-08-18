/**
 * @fileoverview Block persistence ops for canvas structural edits.
 *
 * Ordering: the durable document order is each block row's `fractionalIndex`
 * (see `src/lib/blocks/fractional-order.ts`) — every structural edit computes
 * the affected rows' new keys via `assignFractionalIndexes` against the
 * transaction's previous order and writes them on the rows in the same
 * transaction. `localPagesCollection.blockOrder` is still dual-written as the
 * legacy mirror (the read fallback for pre-migration rows and shipped seeds);
 * it must stay byte-equal to the fractional order until its removal step
 * lands. The hot path is one `PageBlockTransaction` per reducer dispatch
 * committed by `commitPageBlockTransaction`; `applyPageBlockDiff` covers bulk
 * edits (paste, columns). Order-changing commits bump page `updatedAt` but
 * never `createdAt`.
 *
 * `deletedInTransaction` tracks rows already deleted in the open transaction
 * so a re-insert of the same id uses collection `insert`, not `update`.
 */
import { createTransaction } from "@tanstack/react-db";
import { generateNKeysBetween } from "fractional-indexing";

import {
  localBlocksCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { isSyncedMode } from "@/db/collections/sync-mode.ts";
import { pushWhenSynced } from "@/db/collections/synced-mutations.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { assignFractionalIndexes } from "@/lib/blocks/fractional-order.ts";
import { markPageDirty } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { schedulePageSnapshotCapture } from "@/lib/pages/capture-page-snapshot.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";
import { toLocalBlock } from "@/lib/schemas/local-block.ts";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Apply block fields onto an existing row without clobbering its immutable
 * `createdAt` (which `toLocalBlock` re-derives from `updatedAt` on every call).
 * Backfills `createdAt` for legacy rows that predate the field.
 */
function assignBlockPreservingCreatedAt(
  draft: { createdAt?: string },
  next: LocalBlock
): void {
  const preserved = draft.createdAt;
  Object.assign(draft, next);
  draft.createdAt = preserved ?? next.createdAt;
}

/** Commit a collection transaction; mark dirty on success, surface failures. */
function commitAndMarkDirty(
  commit: () => Promise<unknown>,
  pageId?: string
): void {
  commit()
    .then(() => {
      if (pageId) {
        // The dirty cookie is the anonymous-mode SSR hint; synced pages render
        // from the server database, so only the snapshot timeline applies.
        if (!isSyncedMode()) {
          markPageDirty(pageId);
        }
        schedulePageSnapshotCapture(pageId);
      }
    })
    .catch(reportPersistenceError);
}

export interface ReplacePageBlocksOptions {
  /**
   * Mutable set of block ids already removed from the collection in this editor
   * transaction. Skips redundant deletes and uses insert when re-adding.
   */
  deletedInTransaction?: Set<string>;
  /** When set, mutations queue on this tx instead of committing immediately. */
  tx?: PageBlockTransaction;
}

export interface PageBlockTransaction {
  blockOrder: string[];
  deletedInTransaction: Set<string>;
  /**
   * Current fractional index of every block in `blockOrder` (undefined for
   * legacy rows), kept in lockstep with `blockOrder` so consecutive ops in
   * one transaction assign keys against in-flight state. Entries for ids
   * whose rows are not yet inserted are picked up by the pending insert.
   */
  fractionalIndexById: Map<string, string | undefined>;
  inner: {
    mutate: (callback: () => void) => void;
    commit: () => Promise<unknown>;
  };
  pageId: string;
  timestamp: string;
}

function createPageBlockTransactionInner(): PageBlockTransaction["inner"] {
  return createTransaction({
    // Committed explicitly by `commitPageBlockTransaction`; the default
    // auto-commit would close the transaction on the first mutate().
    autoCommit: false,
    mutationFn: async ({ transaction }) => {
      // Synced mode: one POST /api/sync/mutate transaction, optimistic state
      // held until the txid returns on the shape streams.
      if (await pushWhenSynced(transaction)) {
        return;
      }
      localPagesCollection.utils.acceptMutations(transaction);
      localBlocksCollection.utils.acceptMutations(transaction);
      await Promise.resolve();
    },
  });
}

export function beginPageBlockTransaction(
  pageId: string,
  blockOrder: string[],
  deletedInTransaction?: Set<string>
): PageBlockTransaction {
  return {
    pageId,
    blockOrder: [...blockOrder],
    deletedInTransaction: deletedInTransaction ?? new Set(),
    fractionalIndexById: new Map(
      blockOrder.map((id) => [
        id,
        localBlocksCollection.get(id)?.fractionalIndex,
      ])
    ),
    timestamp: nowIso(),
    inner: createPageBlockTransactionInner(),
  };
}

/**
 * Advance the transaction to `nextOrder`: computes the fractional-index
 * assignments the transition requires, folds them into the tx state, and
 * returns them for row writes.
 */
function advanceTxOrder(
  tx: PageBlockTransaction,
  nextOrder: string[]
): Map<string, string> {
  const assigned = assignFractionalIndexes(
    tx.blockOrder,
    tx.fractionalIndexById,
    nextOrder
  );
  tx.blockOrder = [...nextOrder];

  const nextIds = new Set(nextOrder);
  for (const id of [...tx.fractionalIndexById.keys()]) {
    if (!nextIds.has(id)) {
      tx.fractionalIndexById.delete(id);
    }
  }
  for (const [id, key] of assigned) {
    tx.fractionalIndexById.set(id, key);
  }
  return assigned;
}

/**
 * Write newly assigned indexes onto existing rows. Rows not yet in the
 * collection are skipped — their pending insert reads the key from
 * `tx.fractionalIndexById`. Must run inside `tx.inner.mutate`.
 */
function writeAssignedIndexes(
  assigned: Map<string, string>,
  tx: PageBlockTransaction
): void {
  for (const [blockId, fractionalIndex] of assigned) {
    if (
      tx.deletedInTransaction.has(blockId) ||
      !localBlocksCollection.has(blockId)
    ) {
      continue;
    }
    localBlocksCollection.update(blockId, (draft) => {
      draft.fractionalIndex = fractionalIndex;
      draft.updatedAt = tx.timestamp;
    });
  }
}

/** LocalBlock for a tx write, carrying the tx's fractional index when one is assigned. */
function localBlockForTx(
  block: Block,
  pageId: string,
  tx: PageBlockTransaction
): LocalBlock {
  const localBlock = toLocalBlock(block, pageId, tx.timestamp);
  const fractionalIndex = tx.fractionalIndexById.get(block.id);
  if (fractionalIndex !== undefined) {
    localBlock.fractionalIndex = fractionalIndex;
  }
  return localBlock;
}

export function commitPageBlockTransaction(tx: PageBlockTransaction): void {
  commitAndMarkDirty(() => tx.inner.commit(), tx.pageId);
}

export function patchBlockOrder(
  pageId: string,
  blockOrder: string[],
  tx: PageBlockTransaction
): void {
  const assigned = advanceTxOrder(tx, blockOrder);
  tx.inner.mutate(() => {
    localPagesCollection.update(pageId, (draft) => {
      draft.blockOrder = blockOrder;
      draft.updatedAt = tx.timestamp;
    });
    writeAssignedIndexes(assigned, tx);
  });
}

function insertPageBlockRow(
  pageId: string,
  block: Block,
  tx: PageBlockTransaction
): void {
  tx.inner.mutate(() => {
    localBlocksCollection.insert(localBlockForTx(block, pageId, tx));
    tx.deletedInTransaction.delete(block.id);
  });
}

export function insertPageBlockAt(
  pageId: string,
  block: Block,
  orderIndex: number,
  tx: PageBlockTransaction
): void {
  const nextOrder = [...tx.blockOrder];
  nextOrder.splice(orderIndex, 0, block.id);
  const assigned = advanceTxOrder(tx, nextOrder);

  tx.inner.mutate(() => {
    localPagesCollection.update(pageId, (draft) => {
      draft.blockOrder = nextOrder;
      draft.updatedAt = tx.timestamp;
    });
    writeAssignedIndexes(assigned, tx);
    localBlocksCollection.insert(localBlockForTx(block, pageId, tx));
    tx.deletedInTransaction.delete(block.id);
  });
}

export function deletePageBlocksInTx(
  pageId: string,
  blockIds: string[],
  tx: PageBlockTransaction
): void {
  if (blockIds.length === 0) {
    return;
  }

  const removeIds = new Set(blockIds);
  const nextOrder = tx.blockOrder.filter((id) => !removeIds.has(id));
  // Survivors keep their keys; assignments only appear when stored keys were
  // inconsistent and the shrink exposes it.
  const assigned = advanceTxOrder(tx, nextOrder);

  tx.inner.mutate(() => {
    localPagesCollection.update(pageId, (draft) => {
      draft.blockOrder = nextOrder;
      draft.updatedAt = tx.timestamp;
    });

    for (const blockId of blockIds) {
      if (tx.deletedInTransaction.has(blockId)) {
        continue;
      }
      // A pristine shipped page's blocks live in shipped JSON, so a row can be
      // deleted before it was ever materialized into the collection. Deleting a
      // key that is not there throws, which would abort the whole edit.
      if (localBlocksCollection.has(blockId)) {
        localBlocksCollection.delete(blockId);
      }
      tx.deletedInTransaction.add(blockId);
    }
    writeAssignedIndexes(assigned, tx);
  });
}

export function updatePageBlockInTx(
  pageId: string,
  block: Block,
  exists: boolean,
  tx: PageBlockTransaction
): void {
  const useInsert = !exists || tx.deletedInTransaction.has(block.id);
  const localBlock = localBlockForTx(block, pageId, tx);

  tx.inner.mutate(() => {
    if (useInsert) {
      localBlocksCollection.insert(localBlock);
      tx.deletedInTransaction.delete(block.id);
      return;
    }

    localBlocksCollection.update(block.id, (draft) => {
      assignBlockPreservingCreatedAt(draft, localBlock);
    });
  });
}

function blocksEqual(left: Block, right: Block): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function queuePageBlockDiffMutations(
  pageId: string,
  previousBlocks: Block[],
  nextBlocks: Block[],
  tx: PageBlockTransaction
): void {
  const previousById = new Map(
    previousBlocks.map((block) => [block.id, block])
  );
  const nextById = new Map(nextBlocks.map((block) => [block.id, block]));

  const toDelete: string[] = [];
  for (const block of previousBlocks) {
    if (!(nextById.has(block.id) || tx.deletedInTransaction.has(block.id))) {
      toDelete.push(block.id);
    }
  }

  const toInsert: Block[] = [];
  const toUpdate: Block[] = [];
  for (const block of nextBlocks) {
    const previous = previousById.get(block.id);
    if (!previous || tx.deletedInTransaction.has(block.id)) {
      toInsert.push(block);
      continue;
    }
    if (!blocksEqual(previous, block)) {
      toUpdate.push(block);
    }
  }

  const blockOrder = nextBlocks.map((block) => block.id);
  patchBlockOrder(pageId, blockOrder, tx);

  if (toDelete.length > 0) {
    tx.inner.mutate(() => {
      for (const blockId of toDelete) {
        if (tx.deletedInTransaction.has(blockId)) {
          continue;
        }
        // See `deletePageBlocksInTx`: previous blocks can predate the page's
        // first materialization, so they may never have reached the collection.
        if (localBlocksCollection.has(blockId)) {
          localBlocksCollection.delete(blockId);
        }
        tx.deletedInTransaction.add(blockId);
      }
    });
  }

  for (const block of toInsert) {
    insertPageBlockRow(pageId, block, tx);
  }

  for (const block of toUpdate) {
    updatePageBlockInTx(pageId, block, true, tx);
  }
}

export function applyPageBlockDiff(
  pageId: string,
  previousBlocks: Block[],
  nextBlocks: Block[],
  _existing: LocalBlock[],
  options?: ReplacePageBlocksOptions
): void {
  const deletedInTransaction = options?.deletedInTransaction;

  if (options?.tx) {
    queuePageBlockDiffMutations(pageId, previousBlocks, nextBlocks, options.tx);
    return;
  }

  const tx = beginPageBlockTransaction(
    pageId,
    previousBlocks.map((block) => block.id),
    deletedInTransaction
  );
  queuePageBlockDiffMutations(pageId, previousBlocks, nextBlocks, tx);
  commitPageBlockTransaction(tx);
}

export function replacePageBlocks(
  pageId: string,
  blocks: Block[],
  existing: LocalBlock[],
  options?: ReplacePageBlocksOptions
): void {
  if (options?.tx) {
    applyPageBlockDiff(pageId, [], blocks, existing, options);
    return;
  }

  const deletedInTransaction = options?.deletedInTransaction;
  const nextIds = new Set(blocks.map((block) => block.id));
  const timestamp = nowIso();
  const existingById = new Map(existing.map((item) => [item.id, item]));

  const tx = createPageBlockTransactionInner();
  const blockOrder = blocks.map((block) => block.id);
  const assignedIndexes = assignFractionalIndexes(
    existing.map((item) => item.id),
    new Map(existing.map((item) => [item.id, item.fractionalIndex])),
    blockOrder
  );

  tx.mutate(() => {
    localPagesCollection.update(pageId, (draft) => {
      draft.blockOrder = blockOrder;
      draft.updatedAt = timestamp;
    });

    for (const block of existing) {
      if (!(nextIds.has(block.id) || deletedInTransaction?.has(block.id))) {
        localBlocksCollection.delete(block.id);
        deletedInTransaction?.add(block.id);
      }
    }

    for (const block of blocks) {
      const localBlock = toLocalBlock(block, pageId, timestamp);
      const fractionalIndex = assignedIndexes.get(block.id);
      if (fractionalIndex !== undefined) {
        localBlock.fractionalIndex = fractionalIndex;
      }
      const found = existingById.get(block.id);
      const useInsert = !found || deletedInTransaction?.has(block.id);

      if (useInsert) {
        localBlocksCollection.insert(localBlock);
      } else {
        localBlocksCollection.update(block.id, (draft) => {
          assignBlockPreservingCreatedAt(draft, localBlock);
        });
      }
    }
  });

  commitAndMarkDirty(() => tx.commit(), pageId);
}

export function upsertPageBlock(
  pageId: string,
  block: Block,
  exists: boolean,
  tx?: PageBlockTransaction
): void {
  if (tx) {
    updatePageBlockInTx(pageId, block, exists, tx);
    return;
  }

  const localBlock = toLocalBlock(block, pageId, nowIso());

  if (exists) {
    localBlocksCollection.update(block.id, (draft) => {
      assignBlockPreservingCreatedAt(draft, localBlock);
    });
    markPageDirty(pageId);
    return;
  }

  localBlocksCollection.insert(localBlock);
  markPageDirty(pageId);
}

export function deletePageBlocks(blockIds: string[]): void {
  if (blockIds.length === 0) {
    return;
  }

  const tx = createTransaction({
    // Committed explicitly below; default auto-commit closes on first mutate().
    autoCommit: false,
    mutationFn: async ({ transaction }) => {
      if (await pushWhenSynced(transaction)) {
        return;
      }
      localBlocksCollection.utils.acceptMutations(transaction);
      await Promise.resolve();
    },
  });

  tx.mutate(() => {
    for (const blockId of blockIds) {
      localBlocksCollection.delete(blockId);
    }
  });

  commitAndMarkDirty(() => tx.commit());
}

export function deleteAllBlocksForPage(existing: LocalBlock[]): void {
  deletePageBlocks(existing.map((block) => block.id));
}

/**
 * Seed a page's initial blocks and the order they are in.
 *
 * The order write is not optional. `blocks` is the document order, and the
 * block shard cannot carry it: reads enumerate the shard's own keys, which say
 * nothing about sequence. A page seeded without `blockOrder` therefore opens in
 * whatever order the shard happens to enumerate — which is how a page created
 * from a template (a materialized row page, a duplicate) came back with its
 * blocks shuffled. Both writes commit in one transaction, so order can never
 * land without its rows or vice versa.
 */
export function seedPageBlocks(pageId: string, blocks: Block[]): void {
  const timestamp = nowIso();

  const tx = createTransaction({
    // Committed explicitly below; default auto-commit closes on first mutate().
    autoCommit: false,
    mutationFn: async ({ transaction }) => {
      if (await pushWhenSynced(transaction)) {
        return;
      }
      localPagesCollection.utils.acceptMutations(transaction);
      localBlocksCollection.utils.acceptMutations(transaction);
      await Promise.resolve();
    },
  });

  const seedIndexes = generateNKeysBetween(null, null, blocks.length);

  tx.mutate(() => {
    for (const [index, block] of blocks.entries()) {
      // Idempotent: StrictMode double-mounted effects can trigger the lazy
      // seed twice before the first pass's rows are visible to the second's
      // captured state — a duplicate insert would crash a fresh profile's
      // first visit.
      if (localBlocksCollection.has(block.id)) {
        continue;
      }
      const localBlock = toLocalBlock(block, pageId, timestamp);
      localBlock.fractionalIndex = seedIndexes[index];
      localBlocksCollection.insert(localBlock);
    }

    // Every caller inserts the page row first; a missing one means the seed is
    // for a page that does not exist, and blocks are all it can honestly write.
    if (localPagesCollection.has(pageId)) {
      localPagesCollection.update(pageId, (draft) => {
        draft.blockOrder = blocks.map((block) => block.id);
      });
    }
  });

  commitAndMarkDirty(() => tx.commit(), pageId);
}
