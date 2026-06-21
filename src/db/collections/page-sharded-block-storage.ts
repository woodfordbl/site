import { getBrowserStorage } from "@/db/collections/browser-storage.ts";
import { localBlockSchema } from "@/lib/schemas/local-block.ts";

export const BLOCK_SHARD_PREFIX = "site-local-blocks:";
export const BLOCK_QUARANTINE_KEY = "site-local-blocks-quarantine";

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

/**
 * Blocks that fail the current schema are dropped at read time and would be
 * destroyed by the next shard overwrite. Before a shard write discards them,
 * copy those raw items to a quarantine key so a schema fix can recover them.
 * Deliberate deletes are unaffected: deleted blocks parsed fine, so a missing
 * id that still parses is a real delete and is not quarantined.
 */
function quarantineUnparseableDroppedItems(
  storage: Storage,
  existing: ShardMap<unknown> | null,
  incoming: ShardMap<unknown>
): void {
  if (!existing) {
    return;
  }

  const dropped: ShardMap<unknown> = {};
  for (const [blockId, stored] of Object.entries(existing)) {
    if (blockId in incoming) {
      continue;
    }
    if (localBlockSchema.safeParse(stored.data).success) {
      continue;
    }
    dropped[blockId] = stored;
  }

  if (Object.keys(dropped).length === 0) {
    return;
  }

  try {
    const raw = storage.getItem(BLOCK_QUARANTINE_KEY);
    const current = raw ? (JSON.parse(raw) as ShardMap<unknown>) : {};
    storage.setItem(
      BLOCK_QUARANTINE_KEY,
      JSON.stringify({ ...current, ...dropped })
    );
    if (import.meta.env.DEV) {
      console.warn(
        `[blocks] quarantined ${Object.keys(dropped).length} block(s) that no longer parse`,
        Object.keys(dropped)
      );
    }
  } catch {
    // Quarantine is best-effort; never block the primary write.
  }
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

export function createPageShardedBlockStorage(
  storage: Storage = getBrowserStorage()
): Storage {
  const lastShardSnapshot = new Map<string, string>();
  /** Block ids this tab last wrote per shard — lets content-only writes skip the quarantine re-read. */
  const lastShardIds = new Map<string, Set<string>>();

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

        const incomingIds = new Set(Object.keys(shard));
        const previousIds = lastShardIds.get(pageId);
        const mayHaveDroppedIds =
          !previousIds ||
          [...previousIds].some((blockId) => !incomingIds.has(blockId));
        if (mayHaveDroppedIds) {
          quarantineUnparseableDroppedItems(
            storage,
            readShard(storage, pageId),
            shard
          );
        }
        writeShard(storage, pageId, shard);
        lastShardSnapshot.set(pageId, serialized);
        lastShardIds.set(pageId, incomingIds);
      }

      const nextPageIds = new Set(grouped.keys());
      for (const pageId of listShardPageIds(storage)) {
        if (nextPageIds.has(pageId)) {
          continue;
        }

        quarantineUnparseableDroppedItems(
          storage,
          readShard(storage, pageId),
          {}
        );
        storage.removeItem(shardKey(pageId));
        lastShardSnapshot.delete(pageId);
        lastShardIds.delete(pageId);
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
