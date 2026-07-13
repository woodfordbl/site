import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  buildPageTree,
  getAncestorPageIds,
} from "@/lib/pages/build-page-tree.ts";
import { flattenVisiblePageRows } from "@/lib/pages/flatten-visible-page-rows.ts";

function sidebarTreePages(pages: PageSummary[]): PageSummary[] {
  return pages.filter(
    (page) =>
      page.databaseRowSource === undefined && page.databaseSource === undefined
  );
}

/** Merges persisted expand ids with ancestors of the active page (sidebar parity). */
export function resolveEffectiveExpandedIds(options: {
  activePageId: string | undefined;
  expandedIds: Iterable<string>;
  pages: PageSummary[];
}): Set<string> {
  const { activePageId, expandedIds, pages } = options;
  const effective = new Set(expandedIds);

  if (activePageId) {
    for (const ancestorId of getAncestorPageIds(activePageId, pages)) {
      effective.add(ancestorId);
    }
  }

  return effective;
}

/** Pre-order page ids for visible sidebar **Pages** rows (expand state respected). */
export function resolveSidebarNavPageIds(options: {
  activePageId?: string;
  expandedIds: Iterable<string>;
  pages: PageSummary[];
}): string[] {
  const { activePageId, expandedIds, pages } = options;
  const tree = buildPageTree(sidebarTreePages(pages));
  const effectiveExpandedIds = resolveEffectiveExpandedIds({
    activePageId,
    expandedIds,
    pages,
  });

  return flattenVisiblePageRows(tree, effectiveExpandedIds).map(
    (row) => row.pageId
  );
}

/** Resolves the adjacent visible sidebar page id; `null` when no navigation. */
export function resolveAdjacentSidebarPageId(options: {
  activePageId: string;
  delta: number;
  expandedIds: Iterable<string>;
  pages: PageSummary[];
}): string | null {
  const { activePageId, delta, expandedIds, pages } = options;
  const orderedIds = resolveSidebarNavPageIds({
    activePageId,
    expandedIds,
    pages,
  });
  const index = orderedIds.indexOf(activePageId);

  if (index === -1) {
    return null;
  }

  return orderedIds[index + delta] ?? null;
}
