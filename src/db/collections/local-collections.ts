import {
  createCollection,
  localStorageCollectionOptions,
} from "@tanstack/react-db";

import { createBlockShardStorageEventApi } from "@/db/collections/block-shard-storage-events.ts";
import {
  backfillPageCreatedAt,
  migrateLocalStorageToV2,
} from "@/db/collections/migrate-local-storage.ts";
import {
  BLOCK_COLLECTION_STORAGE_KEY,
  pageShardedBlockStorage,
} from "@/db/collections/page-sharded-block-storage.ts";
import { reconcileDirtyPagesCookie } from "@/lib/local-draft/reconcile-dirty-pages-cookie.ts";
import { localBlockSchema } from "@/lib/schemas/local-block.ts";
import { localPageSchema } from "@/lib/schemas/local-page.ts";

export const localPagesCollection = createCollection(
  localStorageCollectionOptions({
    id: "local-pages",
    storageKey: "site-local-pages",
    getKey: (item) => item.id,
    schema: localPageSchema,
  })
);

export const localBlocksCollection = createCollection(
  localStorageCollectionOptions({
    id: "local-blocks",
    storageKey: BLOCK_COLLECTION_STORAGE_KEY,
    storage: pageShardedBlockStorage,
    storageEventApi: createBlockShardStorageEventApi(
      pageShardedBlockStorage,
      () => {
        const sync = localBlocksCollection.config.sync as {
          manualTrigger?: () => void;
        };
        sync.manualTrigger?.();
      }
    ),
    getKey: (item) => item.id,
    schema: localBlockSchema,
  })
);

function startLocalCollectionsSync(): void {
  if (typeof window === "undefined") {
    return;
  }

  backfillPageCreatedAt();
  migrateLocalStorageToV2();
  reconcileDirtyPagesCookie();
  localPagesCollection.startSyncImmediate();
  localBlocksCollection.startSyncImmediate();
}

startLocalCollectionsSync();
