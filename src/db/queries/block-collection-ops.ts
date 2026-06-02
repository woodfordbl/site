import { createTransaction } from "@tanstack/react-db";

import {
  localBlocksCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { markPageDirty } from "@/lib/local-draft/dirty-pages-cookie.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";
import { toLocalBlock } from "@/lib/schemas/local-block.ts";

function nowIso(): string {
  return new Date().toISOString();
}

export interface ReplacePageBlocksOptions {
  /**
   * Mutable set of block ids already removed from the collection in this editor
   * transaction. Skips redundant deletes and uses insert when re-adding.
   */
  deletedInTransaction?: Set<string>;
}

export function replacePageBlocks(
  pageId: string,
  blocks: Block[],
  existing: LocalBlock[],
  options?: ReplacePageBlocksOptions
): void {
  const deletedInTransaction = options?.deletedInTransaction;
  const nextIds = new Set(blocks.map((block) => block.id));
  const timestamp = nowIso();

  const tx = createTransaction({
    mutationFn: async ({ transaction }) => {
      localPagesCollection.utils.acceptMutations(transaction);
      localBlocksCollection.utils.acceptMutations(transaction);
      await Promise.resolve();
    },
  });

  const blockOrder = blocks.map((block) => block.id);

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
      const found = existing.find((item) => item.id === block.id);
      const useInsert = !found || deletedInTransaction?.has(block.id);

      if (useInsert) {
        localBlocksCollection.insert(localBlock);
      } else {
        localBlocksCollection.update(block.id, (draft) => {
          Object.assign(draft, localBlock);
        });
      }
    }
  });

  tx.commit().catch(() => undefined);
  markPageDirty(pageId);
}

export function upsertPageBlock(
  pageId: string,
  block: Block,
  exists: boolean
): void {
  const localBlock = toLocalBlock(block, pageId, nowIso());

  if (exists) {
    localBlocksCollection.update(block.id, (draft) => {
      Object.assign(draft, localBlock);
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
    mutationFn: async ({ transaction }) => {
      localBlocksCollection.utils.acceptMutations(transaction);
      await Promise.resolve();
    },
  });

  tx.mutate(() => {
    for (const blockId of blockIds) {
      localBlocksCollection.delete(blockId);
    }
  });

  tx.commit().catch(() => undefined);
}

export function deleteAllBlocksForPage(existing: LocalBlock[]): void {
  deletePageBlocks(existing.map((block) => block.id));
}

export function seedPageBlocks(pageId: string, blocks: Block[]): void {
  const timestamp = nowIso();

  const tx = createTransaction({
    mutationFn: async ({ transaction }) => {
      localBlocksCollection.utils.acceptMutations(transaction);
      await Promise.resolve();
    },
  });

  tx.mutate(() => {
    for (const block of blocks) {
      localBlocksCollection.insert(toLocalBlock(block, pageId, timestamp));
    }
  });

  tx.commit().catch(() => undefined);
  markPageDirty(pageId);
}
