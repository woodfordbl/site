import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import {
  deleteDatabaseRows,
  deleteLiveMarketRows,
  reapplyDatabaseRowDeletion,
  restoreDatabaseRows,
} from "@/db/queries/database-collection-ops.ts";
import type { LiveInstrument } from "@/lib/connectors/live-markets.ts";
import {
  clearSessionUndoKind,
  markSessionUndoKind,
} from "@/lib/databases/database-view-edit-history.ts";
import {
  isLiveMarketsDatabase,
  readLiveMarketInstruments,
} from "@/lib/databases/live-markets-instruments.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

/**
 * Session-scoped undo/redo for database row deletions. Complements canvas
 * block history and saved-view option history: Ctrl+Z picks whichever domain
 * recorded the more recent edit.
 *
 * @see docs/architecture/databases.md
 */

/** Hard cap; oldest entries drop first. */
export const MAX_DATABASE_ROW_EDIT_HISTORY_ENTRIES = 200;

export interface DatabaseRowDeleteHistoryEntry {
  liveMarket?: {
    databaseId: string;
    instrumentsAfter: LiveInstrument[];
    instrumentsBefore: LiveInstrument[];
  };
  rows: LocalDatabaseRow[];
}

interface DatabaseRowEditHistory {
  lastRecordedAt: number;
  redo: DatabaseRowDeleteHistoryEntry[];
  undo: DatabaseRowDeleteHistoryEntry[];
}

const history: DatabaseRowEditHistory = {
  lastRecordedAt: 0,
  redo: [],
  undo: [],
};

function cloneRows(rows: readonly LocalDatabaseRow[]): LocalDatabaseRow[] {
  return JSON.parse(JSON.stringify(rows)) as LocalDatabaseRow[];
}

function cloneInstruments(
  instruments: readonly LiveInstrument[]
): LiveInstrument[] {
  return JSON.parse(JSON.stringify(instruments)) as LiveInstrument[];
}

function cloneEntry(
  entry: DatabaseRowDeleteHistoryEntry
): DatabaseRowDeleteHistoryEntry {
  return {
    rows: cloneRows(entry.rows),
    ...(entry.liveMarket
      ? {
          liveMarket: {
            databaseId: entry.liveMarket.databaseId,
            instrumentsAfter: cloneInstruments(
              entry.liveMarket.instrumentsAfter
            ),
            instrumentsBefore: cloneInstruments(
              entry.liveMarket.instrumentsBefore
            ),
          },
        }
      : {}),
  };
}

function snapshotDeletableRows(rowIds: readonly string[]): LocalDatabaseRow[] {
  const rows: LocalDatabaseRow[] = [];
  const seen = new Set<string>();
  for (const rowId of rowIds) {
    if (seen.has(rowId)) {
      continue;
    }
    seen.add(rowId);
    const row = localDatabaseRowsCollection.get(rowId);
    if (!row) {
      continue;
    }
    const database = localDatabasesCollection.get(row.databaseId);
    if (database && isLiveMarketsDatabase(database)) {
      rows.push(row);
      continue;
    }
    if (row.externalId === undefined) {
      rows.push(row);
    }
  }
  return rows;
}

function recordDatabaseRowDeleteHistory(
  entry: DatabaseRowDeleteHistoryEntry,
  options?: { nowMs?: number }
): void {
  const now = options?.nowMs ?? Date.now();
  history.redo = [];
  history.undo.push(cloneEntry(entry));
  if (history.undo.length > MAX_DATABASE_ROW_EDIT_HISTORY_ENTRIES) {
    history.undo.splice(
      0,
      history.undo.length - MAX_DATABASE_ROW_EDIT_HISTORY_ENTRIES
    );
  }
  history.lastRecordedAt = now;
  clearSessionUndoKind();
}

/** Timestamp of the most recent recorded row deletion (any database). */
export function getLastDatabaseRowEditRecordedAt(): number {
  return history.lastRecordedAt;
}

/**
 * Deletes local or live-market rows without a confirmation dialog and records
 * a session undo entry so Mod+Z restores them. Synced non-live-market rows
 * are skipped (same as {@link deleteDatabaseRows}). Returns whether anything
 * was deleted.
 * @see docs/architecture/databases.md
 */
export function deleteDatabaseRowsUndoable(
  rowIds: readonly string[],
  options?: { nowMs?: number }
): boolean {
  const rows = snapshotDeletableRows(rowIds);
  if (rows.length === 0) {
    return false;
  }

  const ids = rows.map((row) => row.id);
  const owner = localDatabasesCollection.get(rows[0]?.databaseId ?? "");
  if (owner && isLiveMarketsDatabase(owner)) {
    const instrumentsBefore = readLiveMarketInstruments(owner);
    deleteLiveMarketRows(ids);
    const stillPresent = rows.some(
      (row) => localDatabaseRowsCollection.get(row.id) !== undefined
    );
    if (stillPresent) {
      return false;
    }
    const afterOwner = localDatabasesCollection.get(owner.id);
    const instrumentsAfter = afterOwner
      ? readLiveMarketInstruments(afterOwner)
      : instrumentsBefore;
    recordDatabaseRowDeleteHistory(
      {
        rows: cloneRows(rows),
        liveMarket: {
          databaseId: owner.id,
          instrumentsAfter: cloneInstruments(instrumentsAfter),
          instrumentsBefore: cloneInstruments(instrumentsBefore),
        },
      },
      options
    );
    return true;
  }

  deleteDatabaseRows(ids);
  recordDatabaseRowDeleteHistory({ rows: cloneRows(rows) }, options);
  return true;
}

/** Restores the most recent row-deletion undo entry when one exists. */
export function tryUndoDatabaseRowEdit(): boolean {
  const entry = history.undo.pop();
  if (!entry) {
    return false;
  }

  history.redo.push(cloneEntry(entry));
  restoreDatabaseRows(entry.rows, {
    liveMarket: entry.liveMarket
      ? {
          databaseId: entry.liveMarket.databaseId,
          instruments: entry.liveMarket.instrumentsBefore,
        }
      : undefined,
  });
  markSessionUndoKind("database-rows");
  return true;
}

/** Replays the most recent row-deletion redo entry when one exists. */
export function tryRedoDatabaseRowEdit(): boolean {
  const entry = history.redo.pop();
  if (!entry) {
    return false;
  }

  history.undo.push(cloneEntry(entry));
  reapplyDatabaseRowDeletion(
    entry.rows.map((row) => row.id),
    {
      liveMarket: entry.liveMarket
        ? {
            databaseId: entry.liveMarket.databaseId,
            instruments: entry.liveMarket.instrumentsAfter,
          }
        : undefined,
    }
  );
  markSessionUndoKind("database-rows");
  return true;
}

/** Drops both stacks (workspace reset). */
export function clearAllDatabaseRowEditHistories(): void {
  history.undo = [];
  history.redo = [];
  history.lastRecordedAt = 0;
}
