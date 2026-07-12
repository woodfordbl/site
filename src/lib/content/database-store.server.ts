import { hashDatabaseDocument } from "@/lib/content/database-export.ts";
import {
  type DatabaseDocument,
  databaseDocumentSchema,
} from "@/lib/schemas/database-document.ts";

/**
 * Shipped databases, bundled at build time — same glob pattern (and
 * portability rationale) as `page-store.server.ts`. One JSON document per
 * database: `content/databases/{databaseId}.json`, written by the dev
 * save-all flow (`exportDatabaseDocument`).
 */
const databaseModules = import.meta.glob("../../../content/databases/*.json", {
  eager: true,
  import: "default",
});

export interface ShippedDatabaseEntry {
  /** `hashDatabaseDocument(doc)` — the client seeder's baseline marker. */
  contentHash: string;
  doc: DatabaseDocument;
}

let cachedEntries: ShippedDatabaseEntry[] | null = null;

export function getShippedDatabases(): ShippedDatabaseEntry[] {
  if (cachedEntries) {
    return cachedEntries;
  }

  cachedEntries = Object.values(databaseModules).map((moduleData) => {
    const doc = databaseDocumentSchema.parse(moduleData);
    return { doc, contentHash: hashDatabaseDocument(doc) };
  });
  return cachedEntries;
}
