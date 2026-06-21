import { ORDER_STEP } from "@/lib/blocks/order-constants.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";

export function pagesInParentScope(
  pages: PageSummary[],
  parentId: string | null,
  excludePageId?: string
): PageSummary[] {
  return pages.filter(
    (page) => page.id !== excludePageId && (page.parentId ?? null) === parentId
  );
}

/** Sidebar sibling sort: `sidebarOrder` ascending, then title. */
export function comparePageSiblings(
  left: PageSummary,
  right: PageSummary
): number {
  const leftOrder = left.sidebarOrder;
  const rightOrder = right.sidebarOrder;

  if (leftOrder != null && rightOrder != null) {
    const byOrder = leftOrder - rightOrder;
    if (byOrder !== 0) {
      return byOrder;
    }
  }

  return left.title.localeCompare(right.title, undefined, {
    sensitivity: "base",
  });
}

export function sortPagesInScope(
  pages: PageSummary[],
  parentId: string | null,
  excludePageId?: string
): PageSummary[] {
  return pagesInParentScope(pages, parentId, excludePageId).sort(
    comparePageSiblings
  );
}

export function rebalanceSidebarOrders(
  siblings: PageSummary[]
): Map<string, number> {
  const next = new Map<string, number>();
  for (let index = 0; index < siblings.length; index += 1) {
    const page = siblings[index];
    if (page) {
      next.set(page.id, index * ORDER_STEP);
    }
  }
  return next;
}

function appendSidebarOrder(siblings: PageSummary[]): number {
  const last = siblings.at(-1);
  return (
    (last?.sidebarOrder ?? (siblings.length - 1) * ORDER_STEP) + ORDER_STEP
  );
}

function orderBeforeFirstSibling(siblings: PageSummary[]): number {
  const first = siblings[0];
  const firstOrder = first?.sidebarOrder ?? 0;
  if (firstOrder > 0) {
    return firstOrder / 2;
  }

  return -ORDER_STEP / 2;
}

function orderBetweenSiblings(
  siblings: PageSummary[],
  targetIndex: number
): number {
  const before = siblings[targetIndex - 1];
  const at = siblings[targetIndex];
  const beforeOrder = before?.sidebarOrder ?? (targetIndex - 1) * ORDER_STEP;
  const atOrder = at?.sidebarOrder ?? targetIndex * ORDER_STEP;
  const gap = atOrder - beforeOrder;

  if (gap > 0) {
    return beforeOrder + gap / 2;
  }

  return beforeOrder - ORDER_STEP / 2;
}

function orderBeforeSibling(
  siblings: PageSummary[],
  insertBeforePageId: string
): number {
  const targetIndex = siblings.findIndex(
    (page) => page.id === insertBeforePageId
  );
  if (targetIndex < 0) {
    return appendSidebarOrder(siblings);
  }

  if (targetIndex === 0) {
    return orderBeforeFirstSibling(siblings);
  }

  return orderBetweenSiblings(siblings, targetIndex);
}

/** Builds sibling scope order after inserting `page` at `insertBeforePageId`. */
export function buildReorderedSiblingList(options: {
  insertBeforePageId?: string | null;
  page: PageSummary;
  pages: PageSummary[];
  parentId: string | null;
}): PageSummary[] {
  const { insertBeforePageId, page, pages, parentId } = options;
  const siblings = sortPagesInScope(pages, parentId, page.id);
  const moved: PageSummary = { ...page, parentId };

  if (insertBeforePageId == null) {
    return [...siblings, moved];
  }

  const insertIndex = siblings.findIndex(
    (candidate) => candidate.id === insertBeforePageId
  );
  if (insertIndex < 0) {
    return [...siblings, moved];
  }

  return [
    ...siblings.slice(0, insertIndex),
    moved,
    ...siblings.slice(insertIndex),
  ];
}

/** Rebalances every sibling in scope after a sidebar drop. */
export function computeScopeSidebarOrderUpdates(
  reorderedSiblings: PageSummary[]
): { pageId: string; sidebarOrder: number }[] {
  const rebalanced = rebalanceSidebarOrders(reorderedSiblings);
  return reorderedSiblings.map((sibling) => ({
    pageId: sibling.id,
    sidebarOrder: rebalanced.get(sibling.id) ?? 0,
  }));
}

/** Picks a `sidebarOrder` value for a page inserted into a sibling scope. */
export function computeSidebarOrderForInsert(options: {
  siblings: PageSummary[];
  insertBeforePageId?: string | null;
}): number {
  const { siblings, insertBeforePageId } = options;

  if (siblings.length === 0) {
    return 0;
  }

  if (insertBeforePageId) {
    return orderBeforeSibling(siblings, insertBeforePageId);
  }

  return appendSidebarOrder(siblings);
}
