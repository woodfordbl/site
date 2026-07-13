import { hashDatabaseDocument } from "@/lib/content/database-export.ts";
import { parseDatabaseFolder } from "@/lib/content/database-folder.ts";
import { isDevDiskMode } from "@/lib/content/dev-disk/dev-disk-mode.ts";
import type { DatabaseDocument } from "@/lib/schemas/database-document.ts";

/**
 * Shipped databases, bundled at build time — same portability rationale as
 * `page-store.server.ts`. One FOLDER per database:
 * `content/databases/{id}/index.md` (definition + row template) plus an
 * optional `rows.csv`. Dev disk mode reads fresh from the filesystem.
 */
const indexModules = import.meta.glob("../../../content/databases/*/index.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const rowsModules = import.meta.glob("../../../content/databases/*/rows.csv", {
  eager: true,
  query: "?raw",
  import: "default",
});

export interface ShippedDatabaseEntry {
  /** `hashDatabaseDocument(doc)` — the client seeder's baseline marker. */
  contentHash: string;
  doc: DatabaseDocument;
}

const DATABASES_PREFIX = "content/databases/";

function folderIdFromModulePath(modulePath: string): string {
  const tail = modulePath.slice(
    modulePath.indexOf(DATABASES_PREFIX) + DATABASES_PREFIX.length
  );
  return tail.split("/")[0] ?? tail;
}

function toEntry(
  indexMd: string,
  rowsCsv: string | null
): ShippedDatabaseEntry {
  const doc = parseDatabaseFolder({ indexMd, rowsCsv });
  return { doc, contentHash: hashDatabaseDocument(doc) };
}

let cachedEntries: ShippedDatabaseEntry[] | null = null;

function getBundledDatabases(): ShippedDatabaseEntry[] {
  if (cachedEntries) {
    return cachedEntries;
  }
  const rowsByFolder = new Map<string, string>();
  for (const [modulePath, raw] of Object.entries(rowsModules)) {
    rowsByFolder.set(folderIdFromModulePath(modulePath), raw as string);
  }
  cachedEntries = Object.entries(indexModules).map(([modulePath, raw]) => {
    const folderId = folderIdFromModulePath(modulePath);
    return toEntry(raw as string, rowsByFolder.get(folderId) ?? null);
  });
  return cachedEntries;
}

let devCache: {
  entries: ShippedDatabaseEntry[];
  fingerprint: string;
} | null = null;

async function getDevDatabases(): Promise<ShippedDatabaseEntry[]> {
  const { readDatabaseFoldersFromDisk } = await import(
    "@/lib/content/content-databases-fs.server.ts"
  );
  const { folders, fingerprint } = await readDatabaseFoldersFromDisk();
  if (devCache && devCache.fingerprint === fingerprint) {
    return devCache.entries;
  }
  const entries = folders.map((folder) =>
    toEntry(folder.indexMd, folder.rowsCsv)
  );
  devCache = { entries, fingerprint };
  return entries;
}

export function getShippedDatabases(): Promise<ShippedDatabaseEntry[]> {
  if (isDevDiskMode()) {
    return getDevDatabases();
  }
  return Promise.resolve(getBundledDatabases());
}
