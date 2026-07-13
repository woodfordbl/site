import { isDevDiskMode } from "@/lib/content/dev-disk/dev-disk-mode.ts";
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
  if (isDevDiskMode()) {
    return; // disk is the source of truth — there is no dirty overlay
  }
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
