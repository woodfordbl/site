import { useRouterState } from "@tanstack/react-router";

import { normalizePageSlug } from "@/lib/pages/slugify.ts";

const USER_PAGE_PATH_PATTERN = /^\/p\/([^/]+)$/;

export interface ActivePageRef {
  pageId: string | null;
  slug: string | null;
}

export function parseActivePageRef(pathname: string): ActivePageRef {
  const pageIdMatch = pathname.match(USER_PAGE_PATH_PATTERN);
  if (pageIdMatch) {
    return { pageId: pageIdMatch[1], slug: null };
  }

  if (pathname === "/") {
    return { pageId: null, slug: "/" };
  }

  return { pageId: null, slug: normalizePageSlug(pathname) };
}

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
  if (active.pageId) {
    return active.pageId === pageId;
  }

  if (active.slug) {
    return normalizePageSlug(slug) === normalizePageSlug(active.slug);
  }

  return false;
}
