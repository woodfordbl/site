import { replacePageSlugPrefix } from "@/lib/pages/build-page-tree.ts";
import {
  normalizePageSlug,
  type PageNavTarget,
  pageNavTarget,
  pageNavTargetForUserPage,
  pageSlugsEqual,
} from "@/lib/pages/slugify.ts";

const USER_PAGE_PATH_PATTERN = /^\/p\/(.+)$/;

/**
 * True when `slug` is exactly `prefix` or a path under it.
 * Home (`/`) never counts as a prefix of other slugs — nesting under home
 * uses top-level segments, and redirecting every route would be wrong.
 */
export function slugIsUnderPrefix(slug: string, prefix: string): boolean {
  const normalizedSlug = normalizePageSlug(slug);
  const normalizedPrefix = normalizePageSlug(prefix);

  if (pageSlugsEqual(normalizedSlug, normalizedPrefix)) {
    return true;
  }

  if (normalizedPrefix === "/") {
    return false;
  }

  const prefixWithSlash = normalizedPrefix.endsWith("/")
    ? normalizedPrefix
    : `${normalizedPrefix}/`;
  return normalizedSlug.startsWith(prefixWithSlash);
}

function activeSlugFromPathname(pathname: string): string | null {
  const userPageMatch = pathname.match(USER_PAGE_PATH_PATTERN);
  if (userPageMatch?.[1]) {
    return normalizePageSlug(userPageMatch[1]);
  }

  if (pathname === "/") {
    return "/";
  }

  // Non-page app routes keep their path; do not treat them as page slugs.
  if (
    pathname.startsWith("/settings") ||
    pathname.startsWith("/dev") ||
    pathname.startsWith("/template") ||
    pathname.startsWith("/db/")
  ) {
    return null;
  }

  return normalizePageSlug(pathname);
}

/**
 * When the active route sits under a slug prefix that just moved, returns a
 * TanStack Router target for the rewritten path. Uses router navigation (not
 * `history.replaceState`) so splat params rematch and the workspace does not
 * 404 on the stale URL.
 *
 * @see docs/architecture/pages.md#navigation
 */
export function resolveSlugPrefixRedirect(options: {
  nextPrefix: string;
  pathname: string;
  previousPrefix: string;
}): PageNavTarget | null {
  const { nextPrefix, pathname, previousPrefix } = options;
  const previous = normalizePageSlug(previousPrefix);
  const next = normalizePageSlug(nextPrefix);

  if (pageSlugsEqual(previous, next)) {
    return null;
  }

  const activeSlug = activeSlugFromPathname(pathname);
  if (!(activeSlug && slugIsUnderPrefix(activeSlug, previous))) {
    return null;
  }

  const nextSlug = replacePageSlugPrefix(previous, next, activeSlug);
  const userPage = pathname.startsWith("/p/");

  return userPage ? pageNavTargetForUserPage(nextSlug) : pageNavTarget(nextSlug);
}
