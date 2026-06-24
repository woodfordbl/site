import type { PageSummary } from "@/lib/content/list-pages.ts";
import { resolveBand } from "@/lib/dnd/band.ts";
import {
  assertPageCanHaveChild,
  collectDescendantPageIds,
  getPageDepth,
  pagesById,
} from "@/lib/pages/build-page-tree.ts";
import type { FlatVisiblePageRow } from "@/lib/pages/flatten-visible-page-rows.ts";
import { MAX_PAGE_DEPTH } from "@/lib/pages/page-depth.ts";
import {
  applyPreviewDepthToDropTarget,
  computePageListPreviewDepthFromPointer,
} from "@/lib/pages/page-list-preview-depth.ts";
import { sortPagesInScope } from "@/lib/pages/page-sidebar-order.ts";
import { parsePagePath } from "@/lib/pages/slugify.ts";

/** Nest under a row (middle band) or insert before/after a sibling (top/bottom bands). */
export type PageListDropTarget =
  | { kind: "nest"; parentPageId: string }
  | {
      kind: "sibling";
      parentId: string | null;
      edge: "before" | "after";
      anchorPageId: string;
    };

/**
 * Min px (capped by row height) for top/bottom insert bands on each row.
 * Kept small so the central "nest under this page" band stays comfortably
 * hittable (the before/after edges and the between-rows gaps share this value).
 */
export const PAGE_LIST_SIBLING_EDGE_PX = 6;

/** Attribute marking sidebar rows so the DnD surface can snapshot their rects. */
export const PAGE_LIST_ROW_ATTRIBUTE = "data-page-list-row-id";

function siblingEdgePx(rect: DOMRect): number {
  return Math.min(PAGE_LIST_SIBLING_EDGE_PX, rect.height * 0.35);
}

function resolveRowBand(
  clientY: number,
  rect: DOMRect
): "before" | "nest" | "after" {
  const band = resolveBand(clientY, rect, {
    edgePx: PAGE_LIST_SIBLING_EDGE_PX,
  });
  return band === "middle" ? "nest" : band;
}

function maxDescendantPathDepth(pageId: string, pages: PageSummary[]): number {
  let maxDepth = 0;

  for (const descendantId of collectDescendantPageIds(pageId, pages)) {
    const descendant = pages.find((page) => page.id === descendantId);
    if (!descendant) {
      continue;
    }

    const segments = parsePagePath(descendant.slug);
    const page = pages.find((candidate) => candidate.id === pageId);
    const rootSegments = page ? parsePagePath(page.slug).length : 0;
    const relativeDepth = Math.max(0, segments.length - rootSegments);
    maxDepth = Math.max(maxDepth, relativeDepth);
  }

  return maxDepth;
}

function canNestUnder(
  draggingPageId: string,
  parentPageId: string,
  pages: PageSummary[]
): boolean {
  if (draggingPageId === parentPageId) {
    return false;
  }

  if (collectDescendantPageIds(draggingPageId, pages).includes(parentPageId)) {
    return false;
  }

  const pageMap = pagesById(pages);
  const parent = pageMap.get(parentPageId);
  const dragged = pageMap.get(draggingPageId);
  if (dragged?.slug === "/") {
    return false;
  }

  if (!(parent && dragged)) {
    return false;
  }

  try {
    assertPageCanHaveChild(parent, pages);
  } catch {
    return false;
  }

  const parentDepth = getPageDepth(parent, pageMap);
  const subtreeDepth = maxDescendantPathDepth(draggingPageId, pages);
  const nextDepth = parentDepth + 1 + subtreeDepth;
  return nextDepth <= MAX_PAGE_DEPTH;
}

function isNoOpSiblingDrop(
  draggingPageId: string,
  target: Extract<PageListDropTarget, { kind: "sibling" }>,
  pages: PageSummary[]
): boolean {
  const dragged = pages.find((page) => page.id === draggingPageId);
  if (!dragged) {
    return true;
  }

  const currentParentId = dragged.parentId ?? null;
  if (currentParentId !== target.parentId) {
    return false;
  }

  const siblings = pages.filter(
    (page) => (page.parentId ?? null) === currentParentId
  );
  const anchorIndex = siblings.findIndex(
    (page) => page.id === target.anchorPageId
  );
  const dragIndex = siblings.findIndex((page) => page.id === draggingPageId);

  if (anchorIndex < 0 || dragIndex < 0) {
    return false;
  }

  if (target.edge === "before") {
    return dragIndex === anchorIndex || dragIndex === anchorIndex - 1;
  }

  return dragIndex === anchorIndex || dragIndex === anchorIndex + 1;
}

function resolveOffListDropTarget(
  clientY: number,
  visibleRows: FlatVisiblePageRow[],
  rowRects: Map<string, DOMRect>
): PageListDropTarget | null {
  const firstRow = visibleRows[0];
  const lastRow = visibleRows.at(-1);
  if (!(firstRow && lastRow)) {
    return null;
  }

  const firstRect = rowRects.get(firstRow.pageId);
  if (firstRect && clientY < firstRect.top) {
    return {
      kind: "sibling",
      parentId: firstRow.parentId,
      edge: "before",
      anchorPageId: firstRow.pageId,
    };
  }

  const lastRect = rowRects.get(lastRow.pageId);
  if (lastRect && clientY > lastRect.bottom) {
    return {
      kind: "sibling",
      parentId: lastRow.parentId,
      edge: "after",
      anchorPageId: lastRow.pageId,
    };
  }

  return null;
}

function resolveBetweenRowsDropTarget(
  clientY: number,
  visibleRows: FlatVisiblePageRow[],
  rowRects: Map<string, DOMRect>,
  draggingPageId: string,
  pages: PageSummary[]
): PageListDropTarget | null {
  for (let index = 0; index < visibleRows.length - 1; index += 1) {
    const upperRow = visibleRows[index];
    const lowerRow = visibleRows[index + 1];
    if (!(upperRow && lowerRow)) {
      continue;
    }

    const upperRect = rowRects.get(upperRow.pageId);
    const lowerRect = rowRects.get(lowerRow.pageId);
    if (!(upperRect && lowerRect)) {
      continue;
    }

    const zoneTop = upperRect.bottom - siblingEdgePx(upperRect);
    const zoneBottom = lowerRect.top + siblingEdgePx(lowerRect);

    if (clientY < zoneTop || clientY > zoneBottom) {
      continue;
    }

    const gapTarget = resolveGapDropTarget(
      upperRow,
      lowerRow,
      draggingPageId,
      pages
    );
    if (gapTarget) {
      return gapTarget;
    }
  }

  return null;
}

function siblingDropOrNull(
  draggingPageId: string,
  target: Extract<PageListDropTarget, { kind: "sibling" }>,
  pages: PageSummary[]
): PageListDropTarget | null {
  return isNoOpSiblingDrop(draggingPageId, target, pages) ? null : target;
}

/** Drop in the gap between two adjacent rows: prefer before-lower, fall back to after-upper. */
function resolveGapDropTarget(
  upperRow: FlatVisiblePageRow,
  lowerRow: FlatVisiblePageRow,
  draggingPageId: string,
  pages: PageSummary[]
): PageListDropTarget | null {
  const insertBeforeLower = {
    kind: "sibling",
    parentId: lowerRow.parentId,
    edge: "before",
    anchorPageId: lowerRow.pageId,
  } as const;
  const insertAfterUpper = {
    kind: "sibling",
    parentId: upperRow.parentId,
    edge: "after",
    anchorPageId: upperRow.pageId,
  } as const;

  if (upperRow.pageId === draggingPageId) {
    return siblingDropOrNull(draggingPageId, insertBeforeLower, pages);
  }

  if (lowerRow.pageId === draggingPageId) {
    return siblingDropOrNull(draggingPageId, insertAfterUpper, pages);
  }

  return (
    siblingDropOrNull(draggingPageId, insertBeforeLower, pages) ??
    siblingDropOrNull(draggingPageId, insertAfterUpper, pages)
  );
}

function resolveRowDropTarget(
  row: FlatVisiblePageRow,
  clientY: number,
  rect: DOMRect,
  draggingPageId: string,
  pages: PageSummary[]
): PageListDropTarget | null {
  if (row.pageId === draggingPageId) {
    return null;
  }

  const band = resolveRowBand(clientY, rect);

  if (band === "nest") {
    if (!canNestUnder(draggingPageId, row.pageId, pages)) {
      return null;
    }

    return { kind: "nest", parentPageId: row.pageId };
  }

  const siblingTarget: PageListDropTarget = {
    kind: "sibling",
    parentId: row.parentId,
    edge: band,
    anchorPageId: row.pageId,
  };

  if (isNoOpSiblingDrop(draggingPageId, siblingTarget, pages)) {
    return null;
  }

  return siblingTarget;
}

/**
 * Resolves sidebar page DnD from pointer Y (nest vs sibling bands).
 * @see docs/architecture/pages.md#sidebar-drag-and-drop
 */
export function resolvePageListDropTargetFromPointer(options: {
  clientX?: number;
  clientY: number;
  draggingPageId: string | null;
  navRect?: DOMRect | null;
  pages: PageSummary[];
  rowRects: Map<string, DOMRect>;
  visibleRows: FlatVisiblePageRow[];
}): PageListDropTarget | null {
  const {
    clientX,
    clientY,
    draggingPageId,
    navRect,
    pages,
    rowRects,
    visibleRows,
  } = options;

  if (!draggingPageId || visibleRows.length === 0) {
    return null;
  }

  const dragged = pages.find((page) => page.id === draggingPageId);
  if (!dragged) {
    return null;
  }

  const withPreviewDepth = (target: PageListDropTarget): PageListDropTarget => {
    const previewDepth =
      clientX != null && navRect
        ? computePageListPreviewDepthFromPointer(navRect, clientX)
        : null;

    if (previewDepth == null) {
      return target;
    }

    return applyPreviewDepthToDropTarget(
      target,
      previewDepth,
      visibleRows,
      pages
    );
  };

  const offListTarget = resolveOffListDropTarget(
    clientY,
    visibleRows,
    rowRects
  );
  if (offListTarget) {
    return withPreviewDepth(offListTarget);
  }

  const betweenRowsTarget = resolveBetweenRowsDropTarget(
    clientY,
    visibleRows,
    rowRects,
    draggingPageId,
    pages
  );
  if (betweenRowsTarget) {
    return withPreviewDepth(betweenRowsTarget);
  }

  for (let index = visibleRows.length - 1; index >= 0; index -= 1) {
    const row = visibleRows[index];
    if (!row) {
      continue;
    }

    const rect = rowRects.get(row.pageId);
    if (!rect || clientY < rect.top || clientY > rect.bottom) {
      continue;
    }

    const rowTarget = resolveRowDropTarget(
      row,
      clientY,
      rect,
      draggingPageId,
      pages
    );
    if (rowTarget) {
      return withPreviewDepth(rowTarget);
    }
  }

  return null;
}

/**
 * Converts a resolved drop target into a `page.reposition` command payload.
 * @see docs/reference/page-commands.md#page-reposition
 */
export function dropTargetToRepositionCommand(
  target: PageListDropTarget,
  draggingPageId: string,
  pages: PageSummary[]
): {
  pageId: string;
  parentId: string | null;
  insertBeforePageId?: string | null;
  appendPageLinkOnParent: boolean;
} {
  if (target.kind === "nest") {
    return {
      pageId: draggingPageId,
      parentId: target.parentPageId,
      insertBeforePageId: null,
      appendPageLinkOnParent: true,
    };
  }

  let insertBeforePageId: string | null = target.anchorPageId;
  if (target.edge === "after") {
    const siblings = sortPagesInScope(pages, target.parentId, draggingPageId);
    const anchorIndex = siblings.findIndex(
      (page) => page.id === target.anchorPageId
    );
    insertBeforePageId =
      anchorIndex >= 0 && anchorIndex < siblings.length - 1
        ? (siblings[anchorIndex + 1]?.id ?? null)
        : null;
  }

  return {
    pageId: draggingPageId,
    parentId: target.parentId,
    insertBeforePageId,
    appendPageLinkOnParent: false,
  };
}
