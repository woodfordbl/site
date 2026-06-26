import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { blocksFromLocalBlocks } from "@/lib/schemas/local-block.ts";
import { localPageSchema } from "@/lib/schemas/local-page.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";

export interface BootstrapPageBlocks {
  blocks: Block[];
  hasLocal: boolean;
}

/**
 * Synchronous localStorage read of a page's local blocks in document order.
 * Used to paint local-first content before the editor chunk loads (no flash).
 */
export function readBootstrapPageBlocks(pageId: string): BootstrapPageBlocks {
  if (typeof window === "undefined") {
    return { blocks: [], hasLocal: false };
  }

  const localBlocks = readBlockShardForPage(pageId);
  if (localBlocks.length === 0) {
    return { blocks: [], hasLocal: false };
  }

  const localPage = readLocalStorageCollection(
    LOCAL_PAGES_STORAGE_KEY,
    localPageSchema
  ).find((page) => page.id === pageId);

  const raw = blocksFromLocalBlocks(localBlocks);
  return {
    blocks: orderBlocksByIds(raw, localPage?.blockOrder),
    hasLocal: true,
  };
}
