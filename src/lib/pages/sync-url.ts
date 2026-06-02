import { normalizePageSlug, pageSlugParam } from "@/lib/pages/slugify.ts";

export function syncPageUrl(slug: string): void {
  const normalized = normalizePageSlug(slug);
  const path = normalized === "/" ? "/" : `/${pageSlugParam(slug)}`;

  if (window.location.pathname === path) {
    return;
  }

  window.history.replaceState(window.history.state, "", path);
}
