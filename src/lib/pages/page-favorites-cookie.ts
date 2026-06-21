import {
  readDocumentCookie,
  writeDocumentCookie,
} from "@/lib/cookies/document-cookie.ts";

/** Cookie holding the set of favorited page ids (`site-page-favorites`). */
export const PAGE_FAVORITES_COOKIE_NAME = "site-page-favorites";

/** Parses the raw cookie value into a set of page ids (tolerates malformed JSON). */
export function parsePageFavoritesCookie(
  value: string | undefined
): Set<string> {
  if (!value) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

/** Reads favorited page ids from `document.cookie` (empty on SSR / missing). */
export function readPageFavoritesFromDocument(): Set<string> {
  return parsePageFavoritesCookie(
    readDocumentCookie(PAGE_FAVORITES_COOKIE_NAME)
  );
}

/** Persists favorited page ids as a JSON array. */
export function writePageFavoritesToDocument(ids: Set<string>): void {
  writeDocumentCookie(PAGE_FAVORITES_COOKIE_NAME, JSON.stringify([...ids]));
}
