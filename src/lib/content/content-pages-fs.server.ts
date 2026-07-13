import { readdir, readFile, stat } from "node:fs/promises";
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

export interface PageFilesWithStats {
  files: RawPageFile[];
  /** Catalog identity: sorted (path, mtime, size) tuples — the memo key. */
  fingerprint: string;
}

/** Files plus a change fingerprint so dev reads can memoize assembly. */
export async function readPageFilesWithStats(): Promise<PageFilesWithStats> {
  const root = contentPagesRoot();
  const relativePaths = await walkMarkdownFiles(root, root, []);
  relativePaths.sort();
  const entries = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const full = join(root, relativePath);
      const [raw, stats] = await Promise.all([
        readFile(full, "utf-8"),
        stat(full),
      ]);
      return {
        file: { relativePath, raw },
        stamp: `${relativePath}:${stats.mtimeMs}:${stats.size}`,
      };
    })
  );
  return {
    files: entries.map((entry) => entry.file),
    fingerprint: entries.map((entry) => entry.stamp).join("|"),
  };
}
