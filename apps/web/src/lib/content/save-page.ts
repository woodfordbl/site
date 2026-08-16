import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createServerFn } from "@tanstack/react-start";

import { assertAuthorSaveAllowed } from "@/lib/content/author-save-guard.ts";
import { slugToRelativePath } from "@/lib/content/page-path.ts";
import { preserveShippedCreatedAt } from "@/lib/content/preserve-shipped-created-at.ts";
import {
  getShippedPagesCache,
  listShippedPagesFromCache,
  primeShippedPage,
} from "@/lib/content/shipped-pages-cache.ts";
import { pageSchema } from "@/lib/schemas/page.ts";

/**
 * Dev-only author write of one page to `content/pages/{slug-path}.json`.
 * Returns the document as persisted (not as submitted — `createdAt` is
 * preserved from the shipped file) so the client can publish it into its
 * shipped-content caches without re-reading the server.
 *
 * Primes the shared shipped-page cache via [`shipped-pages-cache.ts`](./shipped-pages-cache.ts)
 * (not `page-store.server.ts`) so this RPC module stays legal to import from
 * the client footer without TanStack Start import-protection denying
 * `*.server.*` edges.
 */
export const savePage = createServerFn({ method: "POST" })
  .validator((data: unknown) => pageSchema.parse(data))
  .handler(async ({ data }) => {
    assertAuthorSaveAllowed();
    // Ensure the glob catalog has populated the shared cache before we read
    // createdAt / prime. Dynamic + relative so the client graph never has a
    // static edge into `*.server.*` (TanStack Start import-protection).
    if (!getShippedPagesCache()) {
      const { getShippedPages } = await import("./page-store.server.ts");
      getShippedPages();
    }
    const relativePath = slugToRelativePath(data.slug);
    const filePath = join(process.cwd(), "content", "pages", relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    const persisted = preserveShippedCreatedAt(
      data,
      listShippedPagesFromCache()
    );
    await writeFile(
      filePath,
      `${JSON.stringify(persisted, null, 2)}\n`,
      "utf-8"
    );
    primeShippedPage(relativePath, persisted);
    return { ok: true as const, page: persisted, path: filePath };
  });
