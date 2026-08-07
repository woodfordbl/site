import { useRouterState } from "@tanstack/react-router";

import { normalizePageSlug } from "@/lib/pages/slugify.ts";

const USER_PAGE_PATH_PATTERN = /^\/p\/(.+)$/;

export interface ActivePageRef {
  pageId: string | null;
  slug: string | null;
}

/**
 * Derives the active page slug from `/`, `/$`, or `/p/…` pathnames (normalized metadata slug).
 * @see docs/architecture/pages.md#navigation
 */
export function parseActivePageRef(pathname: string): ActivePageRef {
  const userPageMatch = pathname.match(USER_PAGE_PATH_PATTERN);
  if (userPageMatch) {
    return {
      pageId: null,
      slug: normalizePageSlug(userPageMatch[1]),
    };
  }

  if (pathname === "/") {
    return { pageId: null, slug: "/" };
  }

  return { pageId: null, slug: normalizePageSlug(pathname) };
}

/** Active page slug from the current router pathname. @see docs/architecture/pages.md#navigation */
export function useActivePageRef(): ActivePageRef {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return parseActivePageRef(pathname);
}

export function isActivePage(
  pageId: string,
  slug: string,
  active: ActivePageRef
): boolean {
  if (active.slug) {
    return normalizePageSlug(slug) === normalizePageSlug(active.slug);
  }

  if (active.pageId) {
    return active.pageId === pageId;
  }

  return false;
}

/**
 * True when the active route is `candidateSlug` or a nested path under it
 * (e.g. database hub → row / template). Used by database sidebar rows so the
 * hub stays highlighted on its sub-pages.
 */
export function isActiveOrDescendantSlug(
  candidateSlug: string,
  active: ActivePageRef
): boolean {
  if (!active.slug) {
    return false;
  }

  const candidate = normalizePageSlug(candidateSlug);
  const current = normalizePageSlug(active.slug);
  return current === candidate || current.startsWith(`${candidate}/`);
}
