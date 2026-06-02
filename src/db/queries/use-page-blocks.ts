import { eq, useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import {
  localBlocksCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import type { Block } from "@/lib/schemas/block.ts";
import {
  blocksFromLocalBlocks,
  type LocalBlock,
} from "@/lib/schemas/local-block.ts";
import { type LocalPage, localPageSchema } from "@/lib/schemas/local-page.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";

function readBootstrapLocalPage(pageId: string): LocalPage | null {
  return (
    readLocalStorageCollection(LOCAL_PAGES_STORAGE_KEY, localPageSchema).find(
      (page) => page.id === pageId
    ) ?? null
  );
}

export interface UsePageBlocksResult {
  blocks: Block[];
  bootstrapBlocks: LocalBlock[];
  existingLocalBlocks: LocalBlock[];
  hasSeededBlocks: boolean;
  isReady: boolean;
  liveLocalBlocks: LocalBlock[];
  localPage: LocalPage | null;
}

/** Reactive block + page metadata reads for one page (TanStack DB source of truth). */
export function usePageBlocks(pageId: string): UsePageBlocksResult {
  const bootstrapPage = useMemo(() => readBootstrapLocalPage(pageId), [pageId]);
  const bootstrapBlocks = useMemo(
    () => readBlockShardForPage(pageId),
    [pageId]
  );

  const { data: livePages = [], isReady: localPageReady } = useLiveQuery(
    (query) =>
      query
        .from({ page: localPagesCollection })
        .where(({ page }) => eq(page.id, pageId)),
    [pageId]
  );

  const { data: liveLocalBlocks = [], isReady: localBlocksReady } =
    useLiveQuery(
      (query) =>
        query
          .from({ block: localBlocksCollection })
          .where(({ block }) => eq(block.pageId, pageId)),
      [pageId]
    );

  const localPage = useMemo(() => {
    if (localPageReady) {
      return livePages[0] ?? null;
    }
    return bootstrapPage;
  }, [bootstrapPage, livePages, localPageReady]);

  const existingLocalBlocks = useMemo(
    (): LocalBlock[] => (localBlocksReady ? liveLocalBlocks : bootstrapBlocks),
    [bootstrapBlocks, liveLocalBlocks, localBlocksReady]
  );

  const blocks = useMemo(() => {
    const raw = blocksFromLocalBlocks(existingLocalBlocks);
    return orderBlocksByIds(raw, localPage?.blockOrder);
  }, [existingLocalBlocks, localPage?.blockOrder]);

  const hasSeededBlocks = blocks.length > 0 || liveLocalBlocks.length > 0;

  return {
    blocks,
    bootstrapBlocks,
    existingLocalBlocks,
    hasSeededBlocks,
    isReady: localPageReady && localBlocksReady,
    liveLocalBlocks,
    localPage,
  };
}
