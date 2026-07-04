import { createTransaction } from "@tanstack/react-db";

import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
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
 *   row resets its count.
 */
export function applySyncSnapshot(
  database: LocalDatabase,
  connectorRows: ConnectorRow[],
  priorMissingCounts: Record<string, number> = {}
): SyncSnapshotResult {
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

  const deletes: string[] = [];
  const missingCounts: Record<string, number> = {};
  for (const [externalId, row] of rowsByExternalId) {
    if (snapshotByExternalId.has(externalId)) {
      continue; // Present again — the grace count resets by omission.
    }
    const misses = (priorMissingCounts[externalId] ?? 0) + 1;
    if (misses >= TOMBSTONE_MISSING_SYNCS) {
      deletes.push(row.id);
    } else {
      missingCounts[externalId] = misses;
    }
  }

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
    commitDatabaseTransaction(tx);
  }

  return {
    inserted: inserts.length,
    updated: updates.length,
    removed: deletes.length,
    missingCounts,
  };
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
