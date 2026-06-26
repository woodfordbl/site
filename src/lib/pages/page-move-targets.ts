import { IconArrowBarToUp, IconFile } from "@tabler/icons-react";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import { collectDescendantPageIds } from "@/lib/pages/build-page-tree.ts";
import { assertCanReposition } from "@/lib/pages/reposition-page.ts";
import { parsePagePath } from "@/lib/pages/slugify.ts";

export interface PageMoveTargetItem {
  icon: typeof IconFile;
  id: string;
  keywords: string[];
  label: string;
  parentId: string | null;
}

function canRepositionToParent(
  pageId: string,
  parentId: string | null,
  pages: PageSummary[]
): boolean {
  try {
    assertCanReposition({ pageId, parentId, pages });
    return true;
  } catch {
    return false;
  }
}

function isNoOpMove(
  page: PageSummary,
  parentId: string | null,
  pages: PageSummary[]
): boolean {
  if (page.parentId !== parentId) {
    return false;
  }

  const siblings = pages.filter((candidate) => candidate.parentId === parentId);
  const sorted = [...siblings].sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
  );
  const lastSibling = sorted.at(-1);
  return lastSibling?.id === page.id;
}

/**
 * Valid parent targets for the header "Move to" picker (excludes self, descendants, invalid depth).
 */
export function getPageMoveTargetItems(
  pageId: string,
  pages: PageSummary[]
): PageMoveTargetItem[] {
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    return [];
  }

  const descendantIds = new Set(collectDescendantPageIds(pageId, pages));
  const items: PageMoveTargetItem[] = [];

  if (
    page.slug !== "/" &&
    canRepositionToParent(pageId, null, pages) &&
    !isNoOpMove(page, null, pages)
  ) {
    items.push({
      id: "move-top-level",
      parentId: null,
      label: "Top level",
      icon: IconArrowBarToUp,
      keywords: ["top", "root", "level", "home"],
    });
  }

  for (const candidate of pages) {
    if (candidate.id === pageId || descendantIds.has(candidate.id)) {
      continue;
    }

    if (
      !canRepositionToParent(pageId, candidate.id, pages) ||
      isNoOpMove(page, candidate.id, pages)
    ) {
      continue;
    }

    items.push({
      id: `move-${candidate.id}`,
      parentId: candidate.id,
      label: candidate.title,
      icon: IconFile,
      keywords: [
        candidate.title,
        ...parsePagePath(candidate.slug),
        "move",
        "page",
      ],
    });
  }

  return items.sort((left, right) => {
    if (left.parentId === null) {
      return -1;
    }
    if (right.parentId === null) {
      return 1;
    }
    return left.label.localeCompare(right.label, undefined, {
      sensitivity: "base",
    });
  });
}

export function filterPageMoveTargetItems(
  query: string,
  pageId: string,
  pages: PageSummary[]
): PageMoveTargetItem[] {
  const normalized = query.trim().toLowerCase();
  const items = getPageMoveTargetItems(pageId, pages);

  if (!normalized) {
    return items;
  }

  return items.filter((item) =>
    item.keywords.some((keyword) => keyword.toLowerCase().includes(normalized))
  );
}

/** Returns whether a move target exists for the page. */
export function hasPageMoveTargets(
  pageId: string,
  pages: PageSummary[]
): boolean {
  return getPageMoveTargetItems(pageId, pages).length > 0;
}

/** Home page id lookup for guards in delete/move UI. */
export function findHomePageId(pages: PageSummary[]): string | undefined {
  for (const page of pages) {
    if (page.slug === "/") {
      return page.id;
    }
  }
  return;
}
