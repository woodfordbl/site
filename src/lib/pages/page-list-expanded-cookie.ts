import {
  readDocumentCookie,
  writeDocumentCookie,
} from "@/lib/cookies/document-cookie.ts";

/**
 * Cookie name for sidebar parent-row expand state (`site-page-list-expanded`).
 * @see docs/reference/page-commands.md#page-list
 */
export const PAGE_LIST_EXPANDED_COOKIE_NAME = "site-page-list-expanded";

/** Parses a cookie value into a set of page ids (empty when missing). */
export function parsePageListExpandedIds(
  value: string | undefined
): Set<string> {
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

/** Serializes expanded page ids for the sidebar cookie (sorted, comma-separated). */
export function serializePageListExpandedIds(ids: Iterable<string>): string {
  return [...ids].sort().join(",");
}

/**
 * Reads expanded page ids from `document.cookie` (empty set when absent or on SSR).
 * @see docs/architecture/pages.md#nesting
 */
export function readPageListExpandedIdsFromDocument(): Set<string> {
  return parsePageListExpandedIds(
    readDocumentCookie(PAGE_LIST_EXPANDED_COOKIE_NAME)
  );
}

/**
 * Persists expanded page ids to `document.cookie`; clears the cookie when empty.
 * @see docs/architecture/pages.md#nesting
 */
export function writePageListExpandedIdsToDocument(ids: Set<string>): void {
  if (ids.size === 0) {
    writeDocumentCookie(PAGE_LIST_EXPANDED_COOKIE_NAME, null);
    return;
  }

  writeDocumentCookie(
    PAGE_LIST_EXPANDED_COOKIE_NAME,
    serializePageListExpandedIds(ids)
  );
}
