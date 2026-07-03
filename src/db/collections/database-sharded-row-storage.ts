import { getBrowserStorage } from "@/db/collections/browser-storage.ts";
import { localDatabaseRowSchema } from "@/lib/schemas/database.ts";

export const DATABASE_ROW_SHARD_PREFIX = "site-local-db-rows:";
export const DATABASE_ROW_QUARANTINE_KEY = "site-local-db-rows-quarantine";
export const DATABASE_ROW_COLLECTION_STORAGE_KEY = "site-local-db-rows";

interface StoredItem<T> {
  data: T;
  versionKey: string;
}

type ShardMap<T> = Record<string, StoredItem<T>>;

function shardKey(databaseId: string): string {
  return `${DATABASE_ROW_SHARD_PREFIX}${databaseId}`;
}

function listShardDatabaseIds(storage: Storage): string[] {
  const databaseIds: string[] = [];

  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(DATABASE_ROW_SHARD_PREFIX)) {
      continue;
    }

    databaseIds.push(key.slice(DATABASE_ROW_SHARD_PREFIX.length));
  }

  return databaseIds;
}

function readShard<T>(
  storage: Storage,
  databaseId: string
): ShardMap<T> | null {
  const raw = storage.getItem(shardKey(databaseId));
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
  databaseId: string,
  shard: ShardMap<T>
): void {
  if (Object.keys(shard).length === 0) {
    storage.removeItem(shardKey(databaseId));
    return;
  }

  storage.setItem(shardKey(databaseId), JSON.stringify(shard));
}

/**
 * Rows that fail the current schema are dropped at read time and would be
 * destroyed by the next shard overwrite. Before a shard write discards them,
 * copy those raw items to a quarantine key so a schema fix can recover them.
 * Deliberate deletes are unaffected: deleted rows parsed fine, so a missing
 * id that still parses is a real delete and is not quarantined.
 * (Same pattern as `page-sharded-block-storage.ts`, keyed on the row schema.)
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
  for (const [rowId, stored] of Object.entries(existing)) {
    if (rowId in incoming) {
      continue;
    }
    if (localDatabaseRowSchema.safeParse(stored.data).success) {
      continue;
    }
    dropped[rowId] = stored;
  }

  if (Object.keys(dropped).length === 0) {
    return;
  }

  try {
    const raw = storage.getItem(DATABASE_ROW_QUARANTINE_KEY);
    const current = raw ? (JSON.parse(raw) as ShardMap<unknown>) : {};
    storage.setItem(
      DATABASE_ROW_QUARANTINE_KEY,
      JSON.stringify({ ...current, ...dropped })
    );
    if (import.meta.env.DEV) {
      console.warn(
        `[db-rows] quarantined ${Object.keys(dropped).length} row(s) that no longer parse`,
        Object.keys(dropped)
      );
    }
  } catch {
    // Quarantine is best-effort; never block the primary write.
  }
}

function groupByDatabaseId<T extends { databaseId: string }>(
  collectionMap: ShardMap<T>
): Map<string, ShardMap<T>> {
  const grouped = new Map<string, ShardMap<T>>();

  for (const [rowId, stored] of Object.entries(collectionMap)) {
    const databaseId = stored.data.databaseId;
    const shard = grouped.get(databaseId) ?? {};
    shard[rowId] = stored;
    grouped.set(databaseId, shard);
  }

  return grouped;
}

/**
 * Storage adapter that splits the database-rows collection into one
 * localStorage shard per database (`site-local-db-rows:<databaseId>`), so a
 * cell edit rewrites only that database's shard. Mirrors
 * `createPageShardedBlockStorage`; per-shard snapshot diffing skips writes for
 * untouched databases.
 */
export function createDatabaseShardedRowStorage(
  storage: Storage = getBrowserStorage()
): Storage {
  const lastShardSnapshot = new Map<string, string>();
  /** Row ids this tab last wrote per shard — lets content-only writes skip the quarantine re-read. */
  const lastShardIds = new Map<string, Set<string>>();

  return {
    get length() {
      return storage.length;
    },
    clear(): void {
      for (const databaseId of listShardDatabaseIds(storage)) {
        storage.removeItem(shardKey(databaseId));
      }
      lastShardSnapshot.clear();
    },
    getItem(key: string): string | null {
      if (key !== DATABASE_ROW_COLLECTION_STORAGE_KEY) {
        return storage.getItem(key);
      }

      const merged: ShardMap<unknown> = {};

      for (const databaseId of listShardDatabaseIds(storage)) {
        const shard = readShard(storage, databaseId);
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
      if (key !== DATABASE_ROW_COLLECTION_STORAGE_KEY) {
        storage.removeItem(key);
        return;
      }

      for (const databaseId of listShardDatabaseIds(storage)) {
        storage.removeItem(shardKey(databaseId));
      }
      lastShardSnapshot.clear();
    },
    setItem(key: string, value: string): void {
      if (key !== DATABASE_ROW_COLLECTION_STORAGE_KEY) {
        storage.setItem(key, value);
        return;
      }

      const collectionMap = JSON.parse(value) as ShardMap<{
        databaseId: string;
      }>;
      const grouped = groupByDatabaseId(collectionMap);

      for (const [databaseId, shard] of grouped) {
        const serialized = JSON.stringify(shard);
        if (lastShardSnapshot.get(databaseId) === serialized) {
          continue;
        }

        const incomingIds = new Set(Object.keys(shard));
        const previousIds = lastShardIds.get(databaseId);
        const mayHaveDroppedIds =
          !previousIds ||
          [...previousIds].some((rowId) => !incomingIds.has(rowId));
        if (mayHaveDroppedIds) {
          quarantineUnparseableDroppedItems(
            storage,
            readShard(storage, databaseId),
            shard
          );
        }
        writeShard(storage, databaseId, shard);
        lastShardSnapshot.set(databaseId, serialized);
        lastShardIds.set(databaseId, incomingIds);
      }

      const nextDatabaseIds = new Set(grouped.keys());
      for (const databaseId of listShardDatabaseIds(storage)) {
        if (nextDatabaseIds.has(databaseId)) {
          continue;
        }

        quarantineUnparseableDroppedItems(
          storage,
          readShard(storage, databaseId),
          {}
        );
        storage.removeItem(shardKey(databaseId));
        lastShardSnapshot.delete(databaseId);
        lastShardIds.delete(databaseId);
      }
    },
  };
}

/** Single instance — TanStack `storage` and `storageEventApi` must share this reference. */
export const databaseShardedRowStorage = createDatabaseShardedRowStorage();

/** localStorage key for one database's row shard. */
export function databaseRowShardStorageKey(databaseId: string): string {
  return shardKey(databaseId);
}

/** Database ids that currently have a row shard in storage. */
export function readDatabaseRowShardDatabaseIds(
  storage: Storage = getBrowserStorage()
): string[] {
  return listShardDatabaseIds(storage);
}

type StorageListener = (event: StorageEvent) => void;

function isDatabaseRowShardKey(key: string | null): boolean {
  return key?.startsWith(DATABASE_ROW_SHARD_PREFIX) ?? false;
}

/**
 * TanStack DB only reloads when `event.key === storageKey` and
 * `event.storageArea === storage`. Shard writes use
 * `site-local-db-rows:<databaseId>`, so we synthesize a matching event and
 * pass the same Storage instance as config. Sibling of
 * `createBlockShardStorageEventApi` — that factory hardcodes the block
 * storage key/prefix, so it is mirrored here rather than parameterized (the
 * block storage files stay untouched).
 */
export function createDatabaseRowShardStorageEventApi(
  rowStorage: Storage,
  onShardStorageChange: () => void
): Pick<Window, "addEventListener" | "removeEventListener"> {
  const storageListeners = new Set<StorageListener>();

  function notifyTanStackListeners(browserEvent: StorageEvent): void {
    if (typeof window === "undefined") {
      return;
    }

    if (browserEvent.storageArea !== window.localStorage) {
      return;
    }

    const key = browserEvent.key;
    if (
      key !== DATABASE_ROW_COLLECTION_STORAGE_KEY &&
      !isDatabaseRowShardKey(key)
    ) {
      return;
    }

    onShardStorageChange();

    const synthetic = new StorageEvent("storage", {
      key: DATABASE_ROW_COLLECTION_STORAGE_KEY,
      newValue: browserEvent.newValue,
      oldValue: browserEvent.oldValue,
      storageArea: rowStorage,
      url: browserEvent.url,
    });

    for (const listener of storageListeners) {
      listener(synthetic);
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", notifyTanStackListeners);
  }

  return {
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      _options?: boolean | AddEventListenerOptions
    ): void {
      if (type !== "storage") {
        return;
      }

      if (typeof listener === "object") {
        return;
      }

      const wrapped: StorageListener = (event) => {
        listener(event);
      };

      storageListeners.add(wrapped);
      (
        listener as StorageListener & { __wrapped?: StorageListener }
      ).__wrapped = wrapped;
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      _options?: boolean | EventListenerOptions
    ): void {
      if (type !== "storage") {
        return;
      }

      if (typeof listener === "object") {
        return;
      }

      const wrapped = (
        listener as StorageListener & { __wrapped?: StorageListener }
      ).__wrapped;
      if (wrapped) {
        storageListeners.delete(wrapped);
      }
    },
  };
}
