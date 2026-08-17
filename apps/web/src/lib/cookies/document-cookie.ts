/**
 * Shared client-side cookie read/write for the SSR-hint cookies (sidebar
 * prefs, dirty pages, local page preview, …). These are UI hints, never auth.
 *
 * Writes are size-guarded: browsers silently drop `document.cookie` writes
 * over ~4096 bytes, which would freeze a stale value forever. Callers get a
 * boolean back so they can degrade (e.g. trim the payload) instead.
 */

export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Encoded-value budget, leaving headroom for the name and attributes. */
export const COOKIE_VALUE_BUDGET_BYTES = 3800;

export function readDocumentCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return;
  }

  const prefix = `${name}=`;
  for (const cookie of document.cookie.split(";")) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }

  return;
}

/**
 * Writes (or clears with `null`) a UI-hint cookie. Returns false when the
 * encoded value exceeds the budget and the write was skipped.
 */
export function writeDocumentCookie(
  name: string,
  value: string | null
): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  if (value === null) {
    // biome-ignore lint/suspicious/noDocumentCookie: UI-hint cookie, not auth.
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
    return true;
  }

  const encoded = encodeURIComponent(value);
  if (encoded.length > COOKIE_VALUE_BUDGET_BYTES) {
    return false;
  }

  // biome-ignore lint/suspicious/noDocumentCookie: UI-hint cookie, not auth.
  document.cookie = `${name}=${encoded}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  return true;
}
