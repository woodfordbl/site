import { getBrowserStorage } from "@/db/collections/browser-storage.ts";

export const BLOCK_SHARD_PREFIX = "site-local-blocks:";

interface StoredItem<T> {
  data: T;
  versionKey: string;
}

type ShardMap<T> = Record<string, StoredItem<T>>;

function shardKey(pageId: string): string {
  return `${BLOCK_SHARD_PREFIX}${pageId}`;
}

function listShardPageIds(storage: Storage): string[] {
  const pageIds: string[] = [];

  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(BLOCK_SHARD_PREFIX)) {
      continue;
    }

    pageIds.push(key.slice(BLOCK_SHARD_PREFIX.length));
  }

  return pageIds;
}

function readShard<T>(storage: Storage, pageId: string): ShardMap<T> | null {
  const raw = storage.getItem(shardKey(pageId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ShardMap<T>;
  } catch {
    return null;
  }
}

function writeShard<T>(
  storage: Storage,
  pageId: string,
  shard: ShardMap<T>
): void {
  if (Object.keys(shard).length === 0) {
    storage.removeItem(shardKey(pageId));
    return;
  }

  storage.setItem(shardKey(pageId), JSON.stringify(shard));
}

function groupByPageId<T extends { pageId: string }>(
  collectionMap: ShardMap<T>
): Map<string, ShardMap<T>> {
  const grouped = new Map<string, ShardMap<T>>();

  for (const [blockId, stored] of Object.entries(collectionMap)) {
    const pageId = stored.data.pageId;
    const shard = grouped.get(pageId) ?? {};
    shard[blockId] = stored;
    grouped.set(pageId, shard);
  }

  return grouped;
}

const lastShardSnapshot = new Map<string, string>();

export function createPageShardedBlockStorage(
  storage: Storage = getBrowserStorage()
): Storage {
  return {
    get length() {
      return storage.length;
    },
    clear(): void {
      for (const pageId of listShardPageIds(storage)) {
        storage.removeItem(shardKey(pageId));
      }
      lastShardSnapshot.clear();
    },
    getItem(key: string): string | null {
      if (key !== "site-local-blocks") {
        return storage.getItem(key);
      }

      const merged: ShardMap<unknown> = {};

      for (const pageId of listShardPageIds(storage)) {
        const shard = readShard(storage, pageId);
        if (!shard) {
          continue;
        }

        Object.assign(merged, shard);
      }

      return Object.keys(merged).length > 0 ? JSON.stringify(merged) : null;
    },
    key(index: number): string | null {
      return storage.key(index);
    },
    removeItem(key: string): void {
      if (key !== "site-local-blocks") {
        storage.removeItem(key);
        return;
      }

      for (const pageId of listShardPageIds(storage)) {
        storage.removeItem(shardKey(pageId));
      }
      lastShardSnapshot.clear();
    },
    setItem(key: string, value: string): void {
      if (key !== "site-local-blocks") {
        storage.setItem(key, value);
        return;
      }

      const collectionMap = JSON.parse(value) as ShardMap<{ pageId: string }>;
      const grouped = groupByPageId(collectionMap);

      for (const [pageId, shard] of grouped) {
        const serialized = JSON.stringify(shard);
        if (lastShardSnapshot.get(pageId) === serialized) {
          continue;
        }

        writeShard(storage, pageId, shard);
        lastShardSnapshot.set(pageId, serialized);
      }

      const nextPageIds = new Set(grouped.keys());
      for (const pageId of listShardPageIds(storage)) {
        if (nextPageIds.has(pageId)) {
          continue;
        }

        storage.removeItem(shardKey(pageId));
        lastShardSnapshot.delete(pageId);
      }
    },
  };
}

export const BLOCK_COLLECTION_STORAGE_KEY = "site-local-blocks";

/** Single instance — TanStack `storage` and `storageEventApi` must share this reference. */
export const pageShardedBlockStorage = createPageShardedBlockStorage();

export function blockShardStorageKey(pageId: string): string {
  return shardKey(pageId);
}

export function readBlockShardPageIds(
  storage: Storage = getBrowserStorage()
): string[] {
  return listShardPageIds(storage);
}
