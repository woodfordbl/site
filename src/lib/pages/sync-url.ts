import { normalizePageSlug, pageSlugParam } from "@/lib/pages/slugify.ts";

/**
 * Updates the address bar for a metadata slug without a router navigation.
 * Default: `/` or `/{segments}`; `{ userPage: true }` → `/p/{segments}` for `routeBy: "id"`.
 * @see docs/architecture/pages.md#navigation
 */
export function syncPageUrl(
  slug: string,
  options?: { userPage?: boolean }
): void {
  const normalized = normalizePageSlug(slug);
  let path = normalized === "/" ? "/" : `/${pageSlugParam(slug)}`;
  if (options?.userPage) {
    path = `/p/${pageSlugParam(slug)}`;
  }

  if (window.location.pathname === path) {
    return;
  }

  window.history.replaceState(window.history.state, "", path);
}
