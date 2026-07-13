import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { DatabaseFolderFiles } from "@/lib/content/database-folder.ts";

/**
 * Direct filesystem access to `content/databases/*∕` folders — dev-only
 * surfaces (author saves, dev disk mode). Deployed reads go through the
 * bundled glob in `database-store.server.ts`.
 */

export function contentDatabasesRoot(): string {
  return join(process.cwd(), "content", "databases");
}

export interface DatabaseFolderOnDisk extends DatabaseFolderFiles {
  databaseId: string;
}

export interface DatabaseFoldersWithStats {
  fingerprint: string;
  folders: DatabaseFolderOnDisk[];
}

export async function readDatabaseFoldersFromDisk(): Promise<DatabaseFoldersWithStats> {
  const root = contentDatabasesRoot();
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const stamps: string[] = [];
  const folders: DatabaseFolderOnDisk[] = [];

  for (const entry of entries.filter((item) => item.isDirectory())) {
    const indexPath = join(root, entry.name, "index.md");
    const rowsPath = join(root, entry.name, "rows.csv");
    const indexMd = await readFile(indexPath, "utf-8").catch(() => null);
    if (indexMd === null) {
      continue;
    }
    const rowsCsv = await readFile(rowsPath, "utf-8").catch(() => null);
    const indexStat = await stat(indexPath).catch(() => null);
    const rowsStat = await stat(rowsPath).catch(() => null);
    stamps.push(
      `${entry.name}:${indexStat?.mtimeMs ?? 0}:${indexStat?.size ?? 0}:${rowsStat?.mtimeMs ?? 0}:${rowsStat?.size ?? 0}`
    );
    folders.push({ databaseId: entry.name, indexMd, rowsCsv });
  }

  return { fingerprint: stamps.sort().join("|"), folders };
}
