/**
 * Derived row-index tier for large databases — SCAFFOLD (design locked,
 * implementation deferred; see docs/architecture/databases.md).
 *
 * The canonical format stays text (`content/databases/{id}/rows.csv`); this
 * tier only changes what the RUNTIME does past a size threshold:
 *
 * - At or below `DATABASE_LOCAL_ROWS_LIMIT`, today's behavior is unchanged:
 *   rows seed eagerly into `localDatabaseRowsCollection` localStorage shards.
 * - Above it, rows never enter localStorage. The shipped `rows.csv` is
 *   fetched as a static asset, parsed in a Web Worker, and bulk-put into an
 *   IndexedDB store keyed `[databaseId, rowId]` — rebuilt whenever the
 *   shipped csv hash changes, NEVER the source of truth. User edits overlay
 *   as individual local rows merged at query time (bounded by edit count,
 *   not dataset size), and views read through a paginated async adapter
 *   (the grid already virtualizes).
 * - Dev disk mode at scale patches rows server-side (CSV read-modify-write
 *   via a `patchDatabaseRows` server fn) instead of round-tripping the full
 *   dataset through the client.
 *
 * IndexedDB over SQLite-wasm/OPFS: no wasm payload, no COOP/COEP header
 * requirement, and it matches the codebase's existing idb-keyval patterns
 * (`asset-store.ts`, `page-baseline-store.ts`). Adequate for filter/sort at
 * 100k rows with worker-side evaluation; SQLite remains the escape hatch if
 * relational features (joins/rollups) land later.
 */

/** Row count at which a database graduates from localStorage shards to the derived index. */
export const DATABASE_LOCAL_ROWS_LIMIT = 2000;

/** True when a database's shipped row count needs the derived index tier. */
export function needsRowsIndexTier(rowCount: number): boolean {
  return rowCount > DATABASE_LOCAL_ROWS_LIMIT;
}
