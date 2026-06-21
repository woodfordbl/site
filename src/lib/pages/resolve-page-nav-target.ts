import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  type PageNavTarget,
  pageNavTarget,
  pageNavTargetForUserPage,
} from "@/lib/pages/slugify.ts";

/**
 * Resolves sidebar and `pageLink` navigation: `routeBy: "id"` → `/p/$`, else metadata slug on `/` or `/$`.
 * @see docs/architecture/pages.md#navigation
 */
export function resolvePageNavTarget(
  pageId: string,
  pages: PageSummary[]
): PageNavTarget {
  const page = pages.find((candidate) => candidate.id === pageId);

  if (page?.routeBy === "id") {
    return pageNavTargetForUserPage(page.slug);
  }

  if (page) {
    return pageNavTarget(page.slug);
  }

  return pageNavTarget("/");
}

/** After `page.delete`, navigates to the parent page target or home. @see docs/architecture/pages.md#navigation */
export function resolveDeleteRedirectTarget(
  deletedPageId: string,
  pages: PageSummary[]
): PageNavTarget {
  const deletedPage = pages.find((page) => page.id === deletedPageId);
  const parentId = deletedPage?.parentId ?? null;

  if (parentId) {
    const parent = pages.find((page) => page.id === parentId);
    if (parent) {
      return resolvePageNavTarget(parent.id, pages);
    }
  }

  return pageNavTarget("/");
}
