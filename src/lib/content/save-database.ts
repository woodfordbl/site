import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createServerFn } from "@tanstack/react-start";

import { assertAuthorSaveAllowed } from "@/lib/content/author-save-guard.ts";
import { databaseDocumentSchema } from "@/lib/schemas/database-document.ts";

const SAFE_DATABASE_ID = /^[\w-]+$/;

export const saveDatabase = createServerFn({ method: "POST" })
  .validator((data: unknown) => databaseDocumentSchema.parse(data))
  .handler(async ({ data }) => {
    assertAuthorSaveAllowed();
    // The id is the filename — reject anything that could escape the dir.
    if (!SAFE_DATABASE_ID.test(data.database.id)) {
      throw new Error(`Unsafe database id: ${data.database.id}`);
    }
    const databasesDir = join(process.cwd(), "content", "databases");
    await mkdir(databasesDir, { recursive: true });
    const filePath = join(databasesDir, `${data.database.id}.json`);
    await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    return { ok: true as const, path: filePath };
  });
