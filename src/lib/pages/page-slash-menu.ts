import { IconArrowUpRight, IconFilePlus } from "@tabler/icons-react";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  assertPageCanHaveChild,
  getPageDepth,
  pagesById,
} from "@/lib/pages/build-page-tree.ts";
import { MAX_PAGE_DEPTH } from "@/lib/pages/page-depth.ts";
import { parsePagePath } from "@/lib/pages/slugify.ts";

export type PageSlashMenuAction =
  | { type: "page.create"; parentId: string }
  | { type: "page.link"; pageId: string }
  | { type: "page.link.trigger" };

export const PAGE_LINK_TRIGGER_KEY = "page-link-trigger";

export interface PageSlashMenuItem {
  action: PageSlashMenuAction;
  icon: typeof IconFilePlus;
  key: string;
  keywords: string[];
  label: string;
}

function linkablePages(
  currentPageId: string,
  pages: PageSummary[]
): PageSummary[] {
  return pages.filter((page) => page.id !== currentPageId);
}

export function getPageLinkTargetItems(
  currentPageId: string,
  pages: PageSummary[]
): PageSlashMenuItem[] {
  return linkablePages(currentPageId, pages)
    .map((page) => ({
      key: `page-link-${page.id}`,
      action: { type: "page.link", pageId: page.id } as const,
      label: page.title,
      icon: IconArrowUpRight,
      keywords: [page.title, ...parsePagePath(page.slug), "link", "page"],
    }))
    .sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
    );
}

export function filterPageLinkTargetItems(
  query: string,
  currentPageId: string,
  pages: PageSummary[]
): PageSlashMenuItem[] {
  const normalized = query.trim().toLowerCase();
  const items = getPageLinkTargetItems(currentPageId, pages);

  if (!normalized) {
    return items;
  }

  return items.filter((item) =>
    item.keywords.some((keyword) => keyword.toLowerCase().includes(normalized))
  );
}

export function getNewPageSlashMenuItem(
  currentPageId: string,
  pages: PageSummary[]
): PageSlashMenuItem | null {
  const currentPage = pages.find((page) => page.id === currentPageId);
  const pageMap = pagesById(pages);
  const currentDepth = currentPage ? getPageDepth(currentPage, pageMap) : 0;

  if (!currentPage || currentDepth >= MAX_PAGE_DEPTH) {
    return null;
  }

  try {
    assertPageCanHaveChild(currentPage, pages);
  } catch {
    return null;
  }

  return {
    key: "page-create-subpage",
    action: { type: "page.create", parentId: currentPageId },
    label: "New Page",
    icon: IconFilePlus,
    keywords: ["new page", "page", "child", "nested", "create"],
  };
}

export function hasLinkablePages(
  currentPageId: string,
  pages: PageSummary[]
): boolean {
  return linkablePages(currentPageId, pages).length > 0;
}

export function getPageLinkTriggerItem(): PageSlashMenuItem {
  return {
    key: PAGE_LINK_TRIGGER_KEY,
    action: { type: "page.link.trigger" },
    label: "Link To Page",
    icon: IconArrowUpRight,
    keywords: ["link", "page", "link to page", "page link"],
  };
}
