import { createStore, del, get, set } from "idb-keyval";

/**
 * Per-database sync bookkeeping for the connector sync engine, persisted in
 * its own idb-keyval store (same pattern as `asset-store.ts`) so conditional
 * requests and tombstone grace counts survive reloads. Every helper is
 * fail-soft: environments without IndexedDB (SSR, private-mode edge cases)
 * and storage errors degrade to "no meta" — the engine then just does an
 * unconditional fetch, which is always correct.
 */

const syncMetaStore = createStore("site-db-sync-meta", "meta");

/** Error classification mirrored from `ConnectorError.kind` (kept as a local
 * literal union so this store has no dependency on the connectors module). */
export type SyncErrorKind = "auth" | "config" | "network" | "rateLimit";

export interface SyncMetaError {
  /** ISO timestamp of when the error was recorded. */
  at: string;
  kind?: SyncErrorKind;
  message: string;
}

export interface DatabaseSyncMeta {
  /** Validator from the last successful fetch, replayed as `If-None-Match`. */
  etag?: string;
  /** Last failed attempt; cleared on the next success. */
  lastError?: SyncMetaError;
  /** ISO timestamp of the last successful sync (including 304s). */
  lastSyncedAt?: string;
  /**
   * Tombstone grace counts: externalId → consecutive syncs the row has been
   * missing from the snapshot. Rows are only deleted after 2 consecutive
   * misses so a partial/flaky response never flaps deletes.
   */
  missingCounts?: Record<string, number>;
}

export async function getSyncMeta(
  databaseId: string
): Promise<DatabaseSyncMeta | undefined> {
  if (typeof indexedDB === "undefined") {
    return;
  }
  try {
    return await get<DatabaseSyncMeta>(databaseId, syncMetaStore);
  } catch {
    return;
  }
}

export async function setSyncMeta(
  databaseId: string,
  meta: DatabaseSyncMeta
): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }
  try {
    await set(databaseId, meta, syncMetaStore);
  } catch {
    // Fail-soft: losing sync meta only costs an unconditional refetch.
  }
}

export async function clearSyncMeta(databaseId: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    return;
  }
  try {
    await del(databaseId, syncMetaStore);
  } catch {
    // Fail-soft; stale meta for a deleted database is harmless.
  }
}
