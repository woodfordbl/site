import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  type PageNavTarget,
  pageNavTarget,
  pageNavTargetById,
} from "@/lib/pages/slugify.ts";

export function resolvePageNavTarget(
  pageId: string,
  pages: PageSummary[]
): PageNavTarget {
  const page = pages.find((candidate) => candidate.id === pageId);

  if (page?.routeBy === "id") {
    return pageNavTargetById(pageId);
  }

  if (page) {
    return pageNavTarget(page.slug);
  }

  return pageNavTargetById(pageId);
}

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
