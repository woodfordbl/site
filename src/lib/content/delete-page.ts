import { readdir, rm, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertAuthorSaveAllowed } from "@/lib/content/author-save-guard.ts";
import {
  contentPagesRoot,
  readPageFilesFromDisk,
} from "@/lib/content/content-pages-fs.server.ts";
import { parsePageFrontmatter } from "@/lib/markdown-canonical/frontmatter.ts";

/**
 * Dev disk mode: remove a page's markdown file (matched by frontmatter id —
 * the slug may already have changed locally) and collapse the parent folder
 * when it empties. Dev-only, like every content write.
 */

const FRONTMATTER_FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

async function removeEmptyParents(
  root: string,
  filePath: string
): Promise<void> {
  let dir = dirname(filePath);
  while (dir.startsWith(root) && dir !== root) {
    const remaining = await readdir(dir).catch(() => null);
    if (remaining === null || remaining.length > 0) {
      return;
    }
    await rmdir(dir).catch(() => undefined);
    dir = dirname(dir);
  }
}

export const deletePage = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ pageId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    assertAuthorSaveAllowed();
    const root = contentPagesRoot();
    const files = await readPageFilesFromDisk();
    const removed: string[] = [];
    for (const file of files) {
      const match = FRONTMATTER_FENCE_RE.exec(file.raw);
      if (!match || match[1] === undefined) {
        continue;
      }
      try {
        if (parsePageFrontmatter(match[1]).id !== data.pageId) {
          continue;
        }
      } catch {
        continue;
      }
      const filePath = join(root, file.relativePath);
      await rm(filePath, { force: true });
      await removeEmptyParents(root, filePath);
      removed.push(file.relativePath);
    }
    return { ok: true as const, removed };
  });
