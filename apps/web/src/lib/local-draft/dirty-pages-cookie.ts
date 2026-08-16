/**
 * @fileoverview SSR bridge for local drafts: the `site-local-dirty` cookie
 * mirrors which page ids have local draft data, because localStorage is
 * unavailable during SSR. localStorage remains the source of truth on the
 * client — the cookie is reconciled from it at boot
 * (reconcile-dirty-pages-cookie.ts), marked dirty on first local edit
 * (metadata or blocks, only after a successful commit) and clean on reset,
 * page delete, and author save.
 *
 * Server-side jobs: 404 semantics (an unknown slug on `/$` throws `notFound()`
 * unless dirty/preview cookies suggest a matching local page) and knowing that
 * a dirty page still SSRs the server baseline — the local draft swaps in after
 * hydration. Writes share the ~3800-byte encoded-value budget guard in
 * src/lib/cookies/document-cookie.ts (browsers silently drop oversized
 * `document.cookie` writes, which would freeze a stale value forever).
 */
import {
  readDocumentCookie,
  writeDocumentCookie,
} from "@/lib/cookies/document-cookie.ts";

export const DIRTY_PAGES_COOKIE_NAME = "site-local-dirty";

export function parseDirtyPageIds(value: string | undefined): Set<string> {
  if (!value || value.trim() === "") {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  );
}

export function serializeDirtyPageIds(ids: Iterable<string>): string {
  return [...ids].sort().join(",");
}

export function pageHasLocalDraft(
  pageId: string,
  ids: Set<string> = new Set()
): boolean {
  return ids.has(pageId);
}

export function hasAnyLocalDrafts(ids: Set<string> = new Set()): boolean {
  return ids.size > 0;
}

export function readDirtyPageIdsFromDocument(): Set<string> {
  return parseDirtyPageIds(readDocumentCookie(DIRTY_PAGES_COOKIE_NAME));
}

export function writeDirtyPageIdsToDocument(ids: Set<string>): void {
  if (ids.size === 0) {
    writeDocumentCookie(DIRTY_PAGES_COOKIE_NAME, null);
    return;
  }

  writeDocumentCookie(DIRTY_PAGES_COOKIE_NAME, serializeDirtyPageIds(ids));
}

export function markPageDirty(pageId: string): void {
  const ids = readDirtyPageIdsFromDocument();
  if (ids.has(pageId)) {
    return;
  }

  ids.add(pageId);
  writeDirtyPageIdsToDocument(ids);
}

export function markPageClean(pageId: string): void {
  const ids = readDirtyPageIdsFromDocument();
  if (!ids.has(pageId)) {
    return;
  }

  ids.delete(pageId);
  writeDirtyPageIdsToDocument(ids);
}
