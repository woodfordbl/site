import {
  createCollection,
  localStorageCollectionOptions,
} from "@tanstack/react-db";
import { sweepOrphanAssets } from "@/db/assets/asset-gc.ts";
import { createBlockShardStorageEventApi } from "@/db/collections/block-shard-storage-events.ts";
import {
  backfillBlockCreatedAt,
  backfillPageCreatedAt,
  migrateLocalStorageToV2,
} from "@/db/collections/migrate-local-storage.ts";
import {
  BLOCK_COLLECTION_STORAGE_KEY,
  pageShardedBlockStorage,
} from "@/db/collections/page-sharded-block-storage.ts";
import { scheduleSnapshotPurge } from "@/db/snapshots/snapshot-purge.ts";
import { reconcileDirtyPagesCookie } from "@/lib/local-draft/reconcile-dirty-pages-cookie.ts";
import { localBlockSchema } from "@/lib/schemas/local-block.ts";
import { localPageSchema } from "@/lib/schemas/local-page.ts";

function getHotData(): Record<string, unknown> {
  if (!import.meta.hot) {
    return {};
  }

  const hot = import.meta.hot as { data?: Record<string, unknown> };
  hot.data ??= {};
  return hot.data;
}

function getOrCreateHotCollection<T>(key: string, create: () => T): T {
  const hotData = getHotData();
  const existing = hotData[key];
  if (existing) {
    return existing as T;
  }

  const collection = create();
  hotData[key] = collection;
  return collection;
}

export const localPagesCollection = getOrCreateHotCollection(
  "localPagesCollection",
  () =>
    createCollection(
      localStorageCollectionOptions({
        id: "local-pages",
        storageKey: "site-local-pages",
        getKey: (item) => item.id,
        schema: localPageSchema,
      })
    )
);

export const localBlocksCollection = getOrCreateHotCollection(
  "localBlocksCollection",
  () => {
    // Assigned after creation so the storage-event bridge can re-trigger sync
    // without a self-referencing annotation that would erase the collection's
    // inferred row types.
    let triggerManualSync: (() => void) | undefined;

    const collection = createCollection(
      localStorageCollectionOptions({
        id: "local-blocks",
        storageKey: BLOCK_COLLECTION_STORAGE_KEY,
        storage: pageShardedBlockStorage,
        storageEventApi: createBlockShardStorageEventApi(
          pageShardedBlockStorage,
          () => triggerManualSync?.()
        ),
        getKey: (item) => item.id,
        schema: localBlockSchema,
      })
    );

    triggerManualSync = () => {
      const sync = collection.config.sync as { manualTrigger?: () => void };
      sync.manualTrigger?.();
    };

    return collection;
  }
);

/** Reclaim orphaned media blobs once per boot, off the critical path. */
function scheduleOrphanAssetSweep(): void {
  const run = () => {
    sweepOrphanAssets().catch(() => undefined);
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 30_000 });
    return;
  }
  window.setTimeout(run, 10_000);
}

function startLocalCollectionsSync(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (getHotData().localCollectionsSyncStarted) {
    return;
  }

  backfillPageCreatedAt();
  backfillBlockCreatedAt();
  migrateLocalStorageToV2();
  reconcileDirtyPagesCookie();
  localPagesCollection.startSyncImmediate();
  localBlocksCollection.startSyncImmediate();
  scheduleOrphanAssetSweep();
  scheduleSnapshotPurge();
  getHotData().localCollectionsSyncStarted = true;
}

startLocalCollectionsSync();
