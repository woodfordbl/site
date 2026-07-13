import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createServerFn } from "@tanstack/react-start";

import { assertAuthorSaveAllowed } from "@/lib/content/author-save-guard.ts";
import { hashStableValue } from "@/lib/content/block-hash.ts";
import { serializeDatabaseFolder } from "@/lib/content/database-folder.ts";
import { databaseDocumentSchema } from "@/lib/schemas/database-document.ts";

const SAFE_DATABASE_ID = /^[\w-]+$/;

async function writeAtomic(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath, contents, "utf-8");
  await rename(tempPath, filePath);
}

/**
 * Author save: write one database as its content folder —
 * `content/databases/{id}/index.md` (+ `rows.csv` when rows exist). Legacy
 * single-file JSON documents for the same id are removed.
 */
export const saveDatabase = createServerFn({ method: "POST" })
  .validator((data: unknown) => databaseDocumentSchema.parse(data))
  .handler(async ({ data }) => {
    assertAuthorSaveAllowed();
    // The id is the folder name — reject anything that could escape the dir.
    if (!SAFE_DATABASE_ID.test(data.database.id)) {
      throw new Error(`Unsafe database id: ${data.database.id}`);
    }
    const databasesDir = join(process.cwd(), "content", "databases");
    const folder = join(databasesDir, data.database.id);
    await mkdir(folder, { recursive: true });

    const files = serializeDatabaseFolder(data);
    await writeAtomic(join(folder, "index.md"), files.indexMd);
    if (files.rowsCsv === null) {
      await rm(join(folder, "rows.csv"), { force: true }).catch(
        () => undefined
      );
    } else {
      await writeAtomic(join(folder, "rows.csv"), files.rowsCsv);
    }
    await rm(join(databasesDir, `${data.database.id}.json`), {
      force: true,
    }).catch(() => undefined);

    return {
      ok: true as const,
      path: folder,
      /** Hashes of the written bytes — dev-disk echo suppression tokens. */
      contentHashes: [
        hashStableValue(files.indexMd),
        ...(files.rowsCsv === null ? [] : [hashStableValue(files.rowsCsv)]),
      ],
    };
  });
