/**
 * Deleting a shipped database must stick: `deleteDatabase` hard-deletes the
 * local rows, so without a marker the shipped-content seeder would resurrect
 * the database at every boot. Deleted shipped-database ids are remembered in
 * localStorage (pages get this for free — their tombstone is the local page
 * row's `deletedAt`).
 */

const STORAGE_KEY = "site-shipped-db-tombstones";

export function readShippedDatabaseTombstones(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function recordShippedDatabaseTombstone(databaseId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const tombstones = readShippedDatabaseTombstones();
    tombstones.add(databaseId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...tombstones]));
  } catch {
    // Best-effort — worst case the database reappears on next boot.
  }
}
