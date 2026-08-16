import type { PageSummary } from "@/lib/content/list-pages.ts";
import { getAncestorPageIds } from "@/lib/pages/build-page-tree.ts";
import { sortPagesInScope } from "@/lib/pages/page-sidebar-order.ts";

/** Sorted sibling pages sharing the same `parentId` as `pageId`. */
export function getSiblingPages(
  pageId: string,
  pages: PageSummary[]
): PageSummary[] {
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    return [];
  }

  return sortPagesInScope(pages, page.parentId ?? null);
}

/** Sorted direct child pages of `pageId`. */
export function getDirectChildPages(
  pageId: string,
  pages: PageSummary[]
): PageSummary[] {
  return sortPagesInScope(pages, pageId);
}

export function pageHasDirectChildren(
  pageId: string,
  pages: PageSummary[]
): boolean {
  return pages.some((page) => (page.parentId ?? null) === pageId);
}

/** True when `rowPageId` is the active page or an ancestor of it. */
export function isPageOnActiveBranch(
  rowPageId: string,
  activePageId: string,
  pages: PageSummary[]
): boolean {
  if (rowPageId === activePageId) {
    return true;
  }

  return getAncestorPageIds(activePageId, pages).includes(rowPageId);
}
