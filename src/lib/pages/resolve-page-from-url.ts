import type { PageSummary } from "@/lib/content/list-pages.ts";
import { buildPageLinkUrl } from "@/lib/pages/copy-page-link.ts";

const TRAILING_SLASH_RE = /\/$/;

/**
 * True when `candidate` shares an origin with `origin`. Primary rule for
 * treating a pasted URL as an in-app page link: compare against
 * `window.location.origin` so localhost (any port), Vercel preview hosts, and
 * production all work without a hardcoded domain list.
 *
 * @see docs/architecture/pages.md#page-links
 */
export function isSameOriginUrl(candidate: string, origin: string): boolean {
  try {
    return new URL(candidate).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

function normalizePathname(pathname: string): string {
  if (pathname === "" || pathname === "/") {
    return "/";
  }
  return pathname.replace(TRAILING_SLASH_RE, "") || "/";
}

/**
 * Inverse of {@link buildPageLinkUrl}: when `rawUrl` is same-origin and its
 * pathname matches a known page route (`/`, `/$` shipped slugs, `/p/{slug}`
 * user/database host-relative paths), returns that page's id. Unknown paths
 * and cross-origin URLs return `null` so callers can fall back to an inline
 * link mark.
 *
 * Matching rebuilds each page's share URL and compares pathnames — the same
 * route rules as copy-link, including database hub/row pages that already live
 * in the page catalog.
 *
 * @see docs/architecture/pages.md#page-links
 */
export function resolvePageIdFromUrl(
  rawUrl: string,
  pages: PageSummary[],
  origin: string
): string | null {
  if (!isSameOriginUrl(rawUrl, origin)) {
    return null;
  }

  let pathname: string;
  try {
    pathname = normalizePathname(new URL(rawUrl).pathname);
  } catch {
    return null;
  }

  for (const page of pages) {
    const built = buildPageLinkUrl(page.id, pages, origin);
    if (!built) {
      continue;
    }
    try {
      if (normalizePathname(new URL(built).pathname) === pathname) {
        return page.id;
      }
    } catch {
      // Skip malformed built URLs.
    }
  }

  return null;
}
