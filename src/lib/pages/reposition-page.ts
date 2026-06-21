import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  assertPageCanHaveChild,
  buildSlugFromTitle,
  collectDescendantPageIds,
  getPageDepth,
  pagesById,
  replacePageSlugPrefix,
} from "@/lib/pages/build-page-tree.ts";
import { MAX_PAGE_DEPTH } from "@/lib/pages/page-depth.ts";
import {
  buildReorderedSiblingList,
  computeScopeSidebarOrderUpdates,
} from "@/lib/pages/page-sidebar-order.ts";
import { parsePagePath, slugifyPageSegment } from "@/lib/pages/slugify.ts";

/** Planned metadata writes for a sidebar `page.reposition` drop. */
/** Planned sidebar reparent/reorder write (slug, order, optional nest `pageLink`). @see docs/reference/page-commands.md#page-reposition */
export interface PageRepositionPlan {
  appendPageLinkOnParent: boolean;
  descendantSlugUpdates: { pageId: string; slug: string }[];
  pageId: string;
  parentId: string | null;
  parentPageIdForLink: string | null;
  previousSlug: string;
  scopeSidebarOrderUpdates: { pageId: string; sidebarOrder: number }[];
  sidebarOrder: number;
  slug: string;
  title: string;
}

function maxDescendantPathDepth(pageId: string, pages: PageSummary[]): number {
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    return 0;
  }

  const rootDepth = parsePagePath(page.slug).length;
  let maxRelative = 0;

  for (const descendantId of collectDescendantPageIds(pageId, pages)) {
    const descendant = pages.find((candidate) => candidate.id === descendantId);
    if (!descendant) {
      continue;
    }

    const depth = parsePagePath(descendant.slug).length;
    maxRelative = Math.max(maxRelative, depth - rootDepth);
  }

  return maxRelative;
}

function resolveSlugForReposition(
  page: PageSummary,
  pages: PageSummary[],
  parentId: string | null
): string {
  const withParent = { ...page, parentId };
  return buildSlugFromTitle(withParent, pages, page.title, slugifyPageSegment);
}

/** Validates sidebar reparent/reorder (cycle, depth, home). @see docs/architecture/pages.md#sidebar-drag-and-drop */
export function assertCanReposition(options: {
  pageId: string;
  parentId: string | null;
  pages: PageSummary[];
}): void {
  const { pageId, parentId, pages } = options;
  const pageMap = pagesById(pages);
  const page = pageMap.get(pageId);

  if (!page) {
    throw new Error("Page not found");
  }

  if (page.slug === "/" && parentId !== null) {
    throw new Error("Home cannot be nested under another page");
  }

  if (parentId === pageId) {
    throw new Error("A page cannot be nested under itself");
  }

  if (parentId && collectDescendantPageIds(pageId, pages).includes(parentId)) {
    throw new Error("A page cannot be nested under its descendant");
  }

  if (parentId) {
    const parent = pageMap.get(parentId);
    if (!parent) {
      throw new Error("Parent page not found");
    }

    assertPageCanHaveChild(parent, pages);

    const parentDepth = getPageDepth(parent, pageMap);
    const subtreeDepth = maxDescendantPathDepth(pageId, pages);
    if (parentDepth + 1 + subtreeDepth > MAX_PAGE_DEPTH) {
      throw new Error(
        `Pages cannot be nested deeper than ${MAX_PAGE_DEPTH} segments`
      );
    }
  } else {
    const subtreeDepth = maxDescendantPathDepth(pageId, pages);
    const nextRootDepth = parsePagePath(
      resolveSlugForReposition(page, pages, null)
    ).length;
    if (nextRootDepth + subtreeDepth > MAX_PAGE_DEPTH) {
      throw new Error(
        `Pages cannot be nested deeper than ${MAX_PAGE_DEPTH} segments`
      );
    }
  }
}

/** Computes slug, sidebarOrder, and descendant slug updates for `page.reposition`. */
export function planPageReposition(options: {
  appendPageLinkOnParent?: boolean;
  insertBeforePageId?: string | null;
  pageId: string;
  parentId: string | null;
  pages: PageSummary[];
}): PageRepositionPlan {
  const {
    appendPageLinkOnParent = false,
    insertBeforePageId,
    pageId,
    parentId,
    pages,
  } = options;

  assertCanReposition({ pageId, parentId, pages });

  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    throw new Error("Page not found");
  }

  const previousSlug = page.slug;
  const slug = resolveSlugForReposition(page, pages, parentId);
  const reorderedSiblings = buildReorderedSiblingList({
    insertBeforePageId,
    page,
    pages,
    parentId,
  });
  const scopeSidebarOrderUpdates =
    computeScopeSidebarOrderUpdates(reorderedSiblings);
  const sidebarOrder =
    scopeSidebarOrderUpdates.find((update) => update.pageId === pageId)
      ?.sidebarOrder ?? 0;

  const descendantSlugUpdates: { pageId: string; slug: string }[] = [];
  for (const descendantId of collectDescendantPageIds(pageId, pages)) {
    const descendant = pages.find((candidate) => candidate.id === descendantId);
    if (!descendant) {
      continue;
    }

    descendantSlugUpdates.push({
      pageId: descendantId,
      slug: replacePageSlugPrefix(previousSlug, slug, descendant.slug),
    });
  }

  return {
    appendPageLinkOnParent,
    descendantSlugUpdates,
    pageId,
    parentId,
    parentPageIdForLink: appendPageLinkOnParent ? parentId : null,
    previousSlug,
    scopeSidebarOrderUpdates,
    sidebarOrder,
    slug,
    title: page.title,
  };
}
