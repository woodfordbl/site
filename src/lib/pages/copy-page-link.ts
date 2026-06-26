import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  normalizePageSlug,
  pageNavTargetForUserPage,
} from "@/lib/pages/slugify.ts";

const TRAILING_SLASH_RE = /\/$/;

/**
 * Builds the absolute URL for a page (origin + resolved path).
 */
export function buildPageLinkUrl(
  pageId: string,
  pages: PageSummary[],
  origin: string
): string {
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    return origin;
  }

  const base = origin.replace(TRAILING_SLASH_RE, "");

  if (page.routeBy === "id") {
    const param = pageNavTargetForUserPage(page.slug).params._splat;
    return `${base}/p/${param}`;
  }

  const path = normalizePageSlug(page.slug);
  return path === "/" ? `${base}/` : `${base}${path}`;
}
