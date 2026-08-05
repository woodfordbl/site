import type { Page } from "@/lib/schemas/page.ts";

/**
 * In-memory shipped-page catalog shared by the server glob loader and the
 * author-save write path. Kept out of a `*.server.*` filename so `savePage`'s
 * RPC module (imported from the client footer) can call `primeShippedPage`
 * without tripping TanStack Start import-protection.
 * @see docs/architecture/author-dev-mode.md
 */
let cachedPagesByPath: Map<string, Page> | null = null;

export function getShippedPagesCache(): Map<string, Page> | null {
  return cachedPagesByPath;
}

export function ensureShippedPagesCache(
  build: () => Map<string, Page>
): Map<string, Page> {
  if (cachedPagesByPath) {
    return cachedPagesByPath;
  }
  cachedPagesByPath = build();
  return cachedPagesByPath;
}

/**
 * Records a page that the dev author save just wrote to `content/pages/`.
 * Drops any prior path for the same page id so a slug rename does not leave a
 * duplicate catalog entry.
 */
export function primeShippedPage(relativePath: string, page: Page): void {
  const pagesByPath = cachedPagesByPath ?? new Map<string, Page>();
  cachedPagesByPath = pagesByPath;
  for (const [path, existing] of pagesByPath) {
    if (existing.id === page.id && path !== relativePath) {
      pagesByPath.delete(path);
    }
  }
  pagesByPath.set(relativePath, page);
}

export function listShippedPagesFromCache(): Page[] {
  return cachedPagesByPath ? [...cachedPagesByPath.values()] : [];
}
