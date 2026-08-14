import type { z } from "zod";
import { isSyncedMode } from "@/db/collections/sync-mode.ts";

interface StoredItem<T> {
  data: T;
  versionKey: string;
}

/**
 * Storage key → collection accessor for synced mode. The raw-localStorage
 * fast path below exists to dodge collection-loading races in anonymous local
 * mode; in synced mode localStorage is empty (rows live in the Electric-backed
 * collections), so these reads resolve against the live collection instead.
 * Registered lazily by local-collections.ts to keep the module graph acyclic.
 */
const syncedReaders = new Map<string, () => unknown[]>();

export function registerSyncedReader(
  storageKey: string,
  read: () => unknown[]
): void {
  syncedReaders.set(storageKey, read);
}

function readStoredCollection<T>(
  storageKey: string,
  schema: z.ZodType<T>
): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  if (isSyncedMode()) {
    const read = syncedReaders.get(storageKey);
    if (!read) {
      return [];
    }
    const items: T[] = [];
    for (const row of read()) {
      const result = schema.safeParse(row);
      if (result.success) {
        items.push(result.data);
      }
    }
    return items;
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Record<string, StoredItem<unknown>>;
    const items: T[] = [];

    for (const stored of Object.values(parsed)) {
      const result = schema.safeParse(stored.data);
      if (result.success) {
        items.push(result.data);
      }
    }

    return items;
  } catch {
    return [];
  }
}

export function readLocalStorageCollection<T>(
  storageKey: string,
  schema: z.ZodType<T>
): T[] {
  return readStoredCollection(storageKey, schema);
}
