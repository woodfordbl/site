import { createTransaction } from "@tanstack/react-db";

import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import {
  appendFieldHistory,
  type FieldHistoryAppend,
} from "@/db/history/field-history-store.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { ORDER_STEP } from "@/lib/blocks/order-constants.ts";
import { connectorFieldToDatabaseField } from "@/lib/connectors/build-synced-database.ts";
import type {
  ConnectorFieldDef,
  ConnectorRow,
} from "@/lib/connectors/types.ts";
import type {
  DatabaseCellValue,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Persistence ops for the connector sync engine: applying fetched snapshots
 * to a synced database's rows and reconciling connector-added fields. Pure
 * collection writes — scheduling lives in `src/db/sync/database-sync-engine.ts`.
 */

/** A row is deleted only after missing from this many consecutive snapshots. */
const TOMBSTONE_MISSING_SYNCS = 2;

function nowIso(): string {
  return new Date().toISOString();
}

interface DatabaseTransaction {
  commit: () => Promise<unknown>;
  mutate: (callback: () => void) => void;
}

function createDatabaseTransaction(): DatabaseTransaction {
  return createTransaction({
    // Committed explicitly below; the default auto-commit would close the
    // transaction on the first mutate().
    autoCommit: false,
    mutationFn: async ({ transaction }) => {
      localDatabasesCollection.utils.acceptMutations(transaction);
      localDatabaseRowsCollection.utils.acceptMutations(transaction);
      await Promise.resolve();
    },
  });
}

/** Commit a database transaction; surface persistence failures via toast. */
function commitDatabaseTransaction(tx: DatabaseTransaction): void {
  tx.commit().catch(reportPersistenceError);
}

/**
 * Awaitable variant of {@link commitDatabaseTransaction}: still reports
 * persistence failures via toast, but ALSO rejects so the caller can observe
 * commit failure. The sync engine needs this — persisting a new ETag after a
 * rolled-back row apply would freeze rows behind 304s forever.
 */
function commitDatabaseTransactionAwaitable(
  tx: DatabaseTransaction
): Promise<void> {
  return tx.commit().then(
    () => undefined,
    (error: unknown) => {
      reportPersistenceError(error);
      throw error;
    }
  );
}

/**
 * Deep-copy a draft value into plain objects. TanStack DB update drafts are
 * change-tracking proxies; spreading them into the stored document makes zod
 * v4's `z.record` validation reject the NEXT write ("expected record,
 * received object"). A JSON round-trip flattens every nested proxy — database
 * documents are JSON-safe by schema.
 */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Cheap deep equality for JSON-safe cell values (empty ≙ null). */
function cellValuesEqual(
  left: DatabaseCellValue | undefined,
  right: DatabaseCellValue | undefined
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/** Map a connector row's sourceKey-keyed values onto fieldId keys, dropping
 * source keys the database has no field for (removed/renamed upstream). */
function toSyncedValues(
  connectorValues: ConnectorRow["values"],
  fieldIdBySourceKey: Map<string, string>
): Record<string, DatabaseCellValue> {
  const values: Record<string, DatabaseCellValue> = {};
  for (const [sourceKey, value] of Object.entries(connectorValues)) {
    const fieldId = fieldIdBySourceKey.get(sourceKey);
    if (fieldId !== undefined) {
      values[fieldId] = value;
    }
  }
  return values;
}

export interface SyncSnapshotResult {
  inserted: number;
  /**
   * Next tombstone grace counts, to be persisted in the database's sync meta
   * by the caller (this op never touches the meta store itself).
   */
  missingCounts: Record<string, number>;
  /**
   * Resolves once the row transaction has actually committed to storage
   * (immediately when the snapshot required no writes); rejects on commit
   * failure AFTER the failure has been reported via toast. Callers that
   * persist sync bookkeeping (ETag, missing counts) MUST await this first —
   * recording a new validator for rows that were rolled back would freeze
   * the database behind 304 responses.
   */
  persisted: Promise<void>;
  removed: number;
  updated: number;
}

/**
 * Diff a connector snapshot into the database's rows, in one transaction.
 *
 * - New `externalId` → insert a synced row (no `pageId` — synced rows are
 *   never pages), appended after the current max order.
 * - Existing `externalId` → update ONLY synced field keys in `row.values`.
 *   Local field values and row `order` are preserved untouched (hard product
 *   requirement: users add their own columns to synced tables). Writes are
 *   skipped when every synced value is deep-equal.
 * - Missing from the snapshot → tombstone grace: the returned `missingCounts`
 *   bumps the row's consecutive-miss count (seeded from `priorMissingCounts`);
 *   the row is deleted only once it has been missing from
 *   {@link TOMBSTONE_MISSING_SYNCS} consecutive snapshots, and a reappearing
 *   row resets its count. `options.pruneMissing` skips that grace and deletes
 *   omitted rows on this snapshot — used for the refetch right after a source
 *   edit, where a dropped symbol's absence is intentional, not a provider blip.
 */
/**
 * Decide the fate of rows absent from a snapshot: delete once missing from
 * {@link TOMBSTONE_MISSING_SYNCS} consecutive snapshots (or immediately when
 * `pruneMissing`), otherwise bump and return their consecutive-miss count.
 */
function computeTombstones(
  rowsByExternalId: Map<string, LocalDatabaseRow>,
  snapshotByExternalId: Map<string, ConnectorRow>,
  priorMissingCounts: Record<string, number>,
  pruneMissing: boolean
): { deletes: string[]; missingCounts: Record<string, number> } {
  const deletes: string[] = [];
  const missingCounts: Record<string, number> = {};
  for (const [externalId, row] of rowsByExternalId) {
    if (snapshotByExternalId.has(externalId)) {
      continue; // Present again — the grace count resets by omission.
    }
    const misses = (priorMissingCounts[externalId] ?? 0) + 1;
    if (pruneMissing || misses >= TOMBSTONE_MISSING_SYNCS) {
      deletes.push(row.id);
    } else {
      missingCounts[externalId] = misses;
    }
  }
  return { deletes, missingCounts };
}

export function applySyncSnapshot(
  database: LocalDatabase,
  connectorRows: ConnectorRow[],
  priorMissingCounts: Record<string, number> = {},
  options: { pruneMissing?: boolean } = {}
): SyncSnapshotResult {
  // Record captured values for polled `captureHistory` fields too (the store
  // dedupes, so a static snapshot won't grow a flat series).
  recordCapturedHistory(database, connectorRows);

  const fieldIdBySourceKey = new Map<string, string>();
  for (const field of database.fields) {
    if (field.sourceKey !== undefined) {
      fieldIdBySourceKey.set(field.sourceKey, field.id);
    }
  }

  const databaseRows = localDatabaseRowsCollection.toArray.filter(
    (row) => row.databaseId === database.id
  );
  const rowsByExternalId = new Map<string, LocalDatabaseRow>();
  for (const row of databaseRows) {
    if (row.externalId !== undefined) {
      rowsByExternalId.set(row.externalId, row);
    }
  }

  // Duplicate externalIds in a snapshot collapse to the last occurrence so a
  // sloppy connector payload can never double-insert a row.
  const snapshotByExternalId = new Map(
    connectorRows.map((row) => [row.externalId, row])
  );

  const timestamp = nowIso();
  let appendOrder = Math.max(
    -ORDER_STEP,
    ...databaseRows.map((row, index) => row.order ?? index * ORDER_STEP)
  );

  const inserts: LocalDatabaseRow[] = [];
  const updates: {
    rowId: string;
    values: Record<string, DatabaseCellValue>;
  }[] = [];

  for (const [externalId, connectorRow] of snapshotByExternalId) {
    const syncedValues = toSyncedValues(
      connectorRow.values,
      fieldIdBySourceKey
    );
    const existing = rowsByExternalId.get(externalId);

    if (!existing) {
      appendOrder += ORDER_STEP;
      inserts.push({
        id: crypto.randomUUID(),
        databaseId: database.id,
        externalId,
        values: syncedValues,
        order: appendOrder,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      continue;
    }

    const changed = Object.entries(syncedValues).some(
      ([fieldId, value]) => !cellValuesEqual(existing.values[fieldId], value)
    );
    if (changed) {
      updates.push({ rowId: existing.id, values: syncedValues });
    }
  }

  const { deletes, missingCounts } = computeTombstones(
    rowsByExternalId,
    snapshotByExternalId,
    priorMissingCounts,
    options.pruneMissing ?? false
  );

  let persisted: Promise<void> = Promise.resolve();
  if (inserts.length > 0 || updates.length > 0 || deletes.length > 0) {
    const tx = createDatabaseTransaction();
    tx.mutate(() => {
      for (const row of inserts) {
        localDatabaseRowsCollection.insert(row);
      }
      for (const { rowId, values } of updates) {
        localDatabaseRowsCollection.update(rowId, (draft) => {
          // toPlain: never spread draft proxies into the stored document.
          draft.values = { ...toPlain(draft.values), ...values };
          draft.updatedAt = timestamp;
        });
      }
      for (const rowId of deletes) {
        localDatabaseRowsCollection.delete(rowId);
      }
    });
    persisted = commitDatabaseTransactionAwaitable(tx);
  }

  return {
    inserted: inserts.length,
    updated: updates.length,
    removed: deletes.length,
    missingCounts,
    persisted,
  };
}

/**
 * Record captured numeric values into the field-history store for every field
 * flagged `captureHistory`. Called after a tick or snapshot applies; the value
 * timestamp is the apply time (intraday resolution the provider's day-granular
 * date column can't give). Fire-and-forget — history is best-effort and must
 * never block or fail a row write.
 */
function recordCapturedHistory(
  database: LocalDatabase,
  connectorRows: ConnectorRow[]
): void {
  const capturedFields = database.fields.filter(
    (field) =>
      field.captureHistory === true &&
      field.type === "number" &&
      field.sourceKey !== undefined
  );
  if (capturedFields.length === 0) {
    return;
  }
  const t = Date.now();
  const entries: FieldHistoryAppend[] = [];
  for (const row of connectorRows) {
    for (const field of capturedFields) {
      const value = row.values[field.sourceKey as string];
      if (typeof value === "number" && Number.isFinite(value)) {
        entries.push({
          databaseId: database.id,
          externalId: row.externalId,
          fieldId: field.id,
          t,
          v: value,
        });
      }
    }
  }
  if (entries.length > 0) {
    appendFieldHistory(entries).catch(() => undefined);
  }
}

/**
 * Apply one streaming tick batch to a synced database's rows — a lighter
 * partial-upsert counterpart to {@link applySyncSnapshot} for live feeds.
 *
 * Unlike a snapshot, a tick is NOT authoritative over the whole table: it
 * carries only the rows that just changed, so there is NO tombstone pass —
 * omitted rows are untouched, never deleted. Existing rows update only their
 * synced field keys (local columns preserved, like the snapshot path); an
 * unseen `externalId` inserts a new synced row so a symbol that ticks before
 * its seed still appears. Writes are skipped when nothing actually changed
 * (a common case — a `@ticker` frame can repeat the last price).
 *
 * Fire-and-forget: persistence failures surface via toast (there is no ETag
 * bookkeeping to gate on, so no awaitable handle is returned).
 */
export function applyStreamTick(
  database: LocalDatabase,
  connectorRows: ConnectorRow[]
): void {
  if (connectorRows.length === 0) {
    return;
  }

  // Capture history from the raw streamed values (deduped in the store), even
  // when the row write below is skipped as an unchanged repeat.
  recordCapturedHistory(database, connectorRows);

  const fieldIdBySourceKey = new Map<string, string>();
  for (const field of database.fields) {
    if (field.sourceKey !== undefined) {
      fieldIdBySourceKey.set(field.sourceKey, field.id);
    }
  }

  const databaseRows = localDatabaseRowsCollection.toArray.filter(
    (row) => row.databaseId === database.id
  );
  const rowsByExternalId = new Map<string, LocalDatabaseRow>();
  for (const row of databaseRows) {
    if (row.externalId !== undefined) {
      rowsByExternalId.set(row.externalId, row);
    }
  }

  const timestamp = nowIso();
  let appendOrder = Math.max(
    -ORDER_STEP,
    ...databaseRows.map((row, index) => row.order ?? index * ORDER_STEP)
  );

  const inserts: LocalDatabaseRow[] = [];
  const updates: {
    rowId: string;
    values: Record<string, DatabaseCellValue>;
  }[] = [];

  // Last-write-wins if a batch repeats an externalId.
  const batchByExternalId = new Map(
    connectorRows.map((row) => [row.externalId, row])
  );
  for (const [externalId, connectorRow] of batchByExternalId) {
    const syncedValues = toSyncedValues(
      connectorRow.values,
      fieldIdBySourceKey
    );
    const existing = rowsByExternalId.get(externalId);
    if (!existing) {
      appendOrder += ORDER_STEP;
      inserts.push({
        id: crypto.randomUUID(),
        databaseId: database.id,
        externalId,
        values: syncedValues,
        order: appendOrder,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      continue;
    }
    const changed = Object.entries(syncedValues).some(
      ([fieldId, value]) => !cellValuesEqual(existing.values[fieldId], value)
    );
    if (changed) {
      updates.push({ rowId: existing.id, values: syncedValues });
    }
  }

  if (inserts.length === 0 && updates.length === 0) {
    return;
  }

  const tx = createDatabaseTransaction();
  tx.mutate(() => {
    for (const row of inserts) {
      localDatabaseRowsCollection.insert(row);
    }
    for (const { rowId, values } of updates) {
      localDatabaseRowsCollection.update(rowId, (draft) => {
        draft.values = { ...toPlain(draft.values), ...values };
        draft.updatedAt = timestamp;
      });
    }
  });
  commitDatabaseTransaction(tx);
}

/**
 * Add connector fields (defs carrying a `sourceKey`) that the connector has
 * grown since the database was created. Strictly add-only:
 *
 * - Never removes or retypes an existing field — users may have renamed,
 *   re-iconed, or reordered synced fields, and local fields are sacrosanct.
 * - Columns removed upstream keep their field and simply stop updating.
 *
 * Matching is by `sourceKey` (the stable connector column identity), never by
 * name. Returns the number of fields added.
 */
export function reconcileSyncedFields(
  database: LocalDatabase,
  connectorFieldDefs: ConnectorFieldDef[]
): number {
  const existingSourceKeys = new Set<string>();
  for (const field of database.fields) {
    if (field.sourceKey !== undefined) {
      existingSourceKeys.add(field.sourceKey);
    }
  }

  const added = connectorFieldDefs
    .filter((def) => !existingSourceKeys.has(def.sourceKey))
    .map((def) => connectorFieldToDatabaseField(def));
  if (added.length === 0) {
    return 0;
  }

  const timestamp = nowIso();
  const tx = createDatabaseTransaction();
  tx.mutate(() => {
    localDatabasesCollection.update(database.id, (draft) => {
      draft.fields = [...draft.fields, ...added];
      draft.updatedAt = timestamp;
    });
  });
  commitDatabaseTransaction(tx);

  return added.length;
}
