import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { RawPageFile } from "@/lib/content/assemble-markdown-pages.ts";

/**
 * Direct filesystem access to `content/pages/**∕*.md` — dev-only surfaces
 * (author saves, dev disk mode). Deployed serverless reads go through the
 * bundled glob in `page-store.server.ts` instead.
 */

export function contentPagesRoot(): string {
  return join(process.cwd(), "content", "pages");
}

async function walkMarkdownFiles(
  root: string,
  dir: string,
  acc: string[]
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownFiles(root, full, acc);
    } else if (entry.name.endsWith(".md")) {
      acc.push(full.slice(root.length + 1).replaceAll("\\", "/"));
    }
  }
  return acc;
}

/** Every markdown page file under `content/pages/`, with raw contents. */
export async function readPageFilesFromDisk(): Promise<RawPageFile[]> {
  const root = contentPagesRoot();
  const relativePaths = await walkMarkdownFiles(root, root, []);
  return Promise.all(
    relativePaths.map(async (relativePath) => ({
      relativePath,
      raw: await readFile(join(root, relativePath), "utf-8"),
    }))
  );
}
