import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import {
  createDatabaseWithDefaults,
  type DatabaseSeed,
  replaceShippedDatabase,
} from "@/db/queries/database-collection-ops.ts";
import {
  exportDatabaseDocument,
  hashDatabaseDocument,
} from "@/lib/content/database-export.ts";
import type { ShippedDatabaseEntry } from "@/lib/content/database-store.server.ts";
import { resolveShippedDatabaseAction } from "@/lib/databases/resolve-shipped-database-action.ts";
import { readShippedDatabaseTombstones } from "@/lib/databases/shipped-database-tombstones.ts";
import type { DatabaseDocument } from "@/lib/schemas/database-document.ts";

function toSeed(doc: DatabaseDocument, contentHash: string): DatabaseSeed {
  const now = new Date().toISOString();
  return {
    database: {
      ...doc.database,
      serverBaselineHash: contentHash,
      createdAt: now,
      updatedAt: now,
    },
    rows: doc.rows.map((row) => ({
      ...row,
      databaseId: doc.database.id,
      createdAt: now,
      updatedAt: now,
    })),
  };
}

/**
 * Materializes shipped database documents into the local collections at boot.
 * Unlike pages (rendered from server JSON until first edit), every database
 * surface reads the local collections, so shipped databases seed eagerly:
 *
 * - no local copy → insert (with `serverBaselineHash` recording the baseline)
 * - unedited copy + changed shipped content → replace (deploys propagate)
 * - edited copy → local wins (v1: no merge for databases)
 * - user-deleted shipped database → tombstoned, never resurrected
 *
 * Shipped connector databases seed their definition only (`source` config);
 * the sync engine adopts them and populates rows client-side. Caller awaits
 * both collections' `preload()` first — deciding against a half-loaded
 * collection would misclassify everything as "insert".
 */
export function seedShippedDatabases(entries: ShippedDatabaseEntry[]): void {
  if (entries.length === 0) {
    return;
  }

  const tombstones = readShippedDatabaseTombstones();

  for (const { doc, contentHash } of entries) {
    const local = localDatabasesCollection.get(doc.database.id) ?? null;
    const localCurrentHash = local
      ? hashDatabaseDocument(
          exportDatabaseDocument(local, localDatabaseRowsCollection.toArray)
        )
      : null;

    const action = resolveShippedDatabaseAction({
      local,
      localCurrentHash,
      shippedHash: contentHash,
      tombstoned: tombstones.has(doc.database.id),
    });

    if (action === "insert") {
      createDatabaseWithDefaults(toSeed(doc, contentHash));
    } else if (action === "replace") {
      replaceShippedDatabase(toSeed(doc, contentHash));
    }
  }
}
