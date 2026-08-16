import { hashStableValue } from "@/lib/content/block-hash.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import type {
  DatabaseDocument,
  ShippedDatabaseRow,
} from "@/lib/schemas/database-document.ts";

function compareRowsForExport(
  left: Pick<ShippedDatabaseRow, "id" | "order">,
  right: Pick<ShippedDatabaseRow, "id" | "order">
): number {
  const leftOrder = left.order ?? Number.POSITIVE_INFINITY;
  const rightOrder = right.order ?? Number.POSITIVE_INFINITY;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.id.localeCompare(right.id);
}

/**
 * Builds the shipped document for one database (see
 * [`database-document.ts`](../schemas/database-document.ts) for what ships).
 * Connector-synced rows (`externalId`) are excluded — the shipped `source`
 * config lets the sync engine repopulate them client-side. Rows are ordered
 * deterministically (manual `order`, id tiebreaker) so re-exports of
 * unchanged content produce byte-identical JSON.
 *
 * Pure and isomorphic: the dev save-all exports with it, and the client
 * seeder re-derives a local copy's current hash with it to decide whether the
 * copy diverged from its shipped baseline.
 */
export function exportDatabaseDocument(
  database: LocalDatabase,
  rows: LocalDatabaseRow[]
): DatabaseDocument {
  const {
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    serverBaselineHash: _serverBaselineHash,
    ...definition
  } = database;

  const exportedRows = rows
    .filter((row) => row.databaseId === database.id && !row.externalId)
    .sort(compareRowsForExport)
    .map((row) => {
      const {
        databaseId: _databaseId,
        pageId: _pageId,
        externalId: _externalId,
        createdAt: _rowCreatedAt,
        updatedAt: _rowUpdatedAt,
        ...shipped
      } = row;
      return shipped;
    });

  return { database: definition, rows: exportedRows };
}

/**
 * Stable content hash of a shipped database document (the seed baseline).
 * Row order is normalized first so a hand-reordered JSON file, the exporter's
 * output, and a re-export of a seeded local copy all hash identically.
 */
export function hashDatabaseDocument(doc: DatabaseDocument): string {
  return hashStableValue({
    database: doc.database,
    rows: [...doc.rows].sort(compareRowsForExport),
  });
}
