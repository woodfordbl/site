import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { FlatVisiblePageRow } from "@/lib/pages/flatten-visible-page-rows.ts";
import { MAX_PAGE_DEPTH } from "@/lib/pages/page-depth.ts";
import type { PageListDropTarget } from "@/lib/pages/resolve-page-list-drop-target.ts";

/** Matches `pageListRowPadding` base (`px-2`). */
export const PAGE_LIST_INDENT_BASE_PX = 8;

/** Horizontal pixels per sidebar indent level (`pl-5` / `pl-8` steps). */
export const PAGE_LIST_INDENT_STEP_PX = 12;

/**
 * Sidebar UI depth is 0-based. Matches {@link MAX_PAGE_DEPTH} path segments
 * minus one (a depth-5 page is UI depth 4).
 */
export const PAGE_LIST_MAX_UI_DEPTH = MAX_PAGE_DEPTH - 1;

/**
 * Static left-padding classes per UI depth — must be literal strings so
 * Tailwind emits CSS (dynamic `pl-[Npx]` templates are purged).
 */
const PAGE_LIST_PADDING_LEFT = [
  "pl-2",
  "pl-5",
  "pl-8",
  "pl-[2.75rem]",
  "pl-[3.5rem]",
] as const;

function pageListPaddingLeftClass(depth: number): string {
  const clamped = Math.min(PAGE_LIST_MAX_UI_DEPTH, Math.max(0, depth)) as
    | 0
    | 1
    | 2
    | 3
    | 4;
  return PAGE_LIST_PADDING_LEFT[clamped];
}

/** Tailwind horizontal padding for a sidebar page row at `depth` (0-based). */
export function pageListRowPadding(depth: number): string {
  if (depth <= 0) {
    return "px-2";
  }
  return `pr-2 ${pageListPaddingLeftClass(depth)}`;
}

/** Left padding only — when right padding is set separately (e.g. `pr-8` menu action). */
export function pageListRowPaddingLeft(depth: number): string {
  return pageListPaddingLeftClass(depth);
}

export function computePageListPreviewDepthFromPointer(
  navRect: DOMRect,
  clientX: number
): number {
  const relativeX = clientX - navRect.left;
  if (relativeX < PAGE_LIST_INDENT_BASE_PX) {
    return 0;
  }

  const rawDepth = Math.floor(
    (relativeX - PAGE_LIST_INDENT_BASE_PX) / PAGE_LIST_INDENT_STEP_PX
  );
  return Math.min(PAGE_LIST_MAX_UI_DEPTH, Math.max(0, rawDepth));
}

function findVisibleAncestorAtDepth(
  pageId: string,
  targetDepth: number,
  visibleRows: FlatVisiblePageRow[]
): FlatVisiblePageRow | null {
  const rowById = new Map(visibleRows.map((row) => [row.pageId, row]));
  let current = rowById.get(pageId);
  if (!current) {
    return null;
  }

  while (current.depth > targetDepth && current.parentId) {
    const parent = rowById.get(current.parentId);
    if (!parent) {
      break;
    }
    current = parent;
  }

  return current.depth === targetDepth ? current : current;
}

/**
 * Adjusts Y-resolved drop targets when the pointer is dragged horizontally
 * (shallower depth unnests to root or an ancestor scope). Used at drop-resolve
 * time only — sidebar row padding does not preview indent during drag.
 * @see docs/architecture/pages.md#sidebar-drag-and-drop
 */
export function applyPreviewDepthToDropTarget(
  target: PageListDropTarget,
  previewDepth: number,
  visibleRows: FlatVisiblePageRow[],
  _pages: PageSummary[]
): PageListDropTarget {
  if (target.kind === "nest") {
    const parentRow = visibleRows.find(
      (row) => row.pageId === target.parentPageId
    );
    if (!parentRow) {
      return target;
    }

    const intendedChildDepth = parentRow.depth + 1;
    if (previewDepth >= intendedChildDepth) {
      return target;
    }

    const ancestor = findVisibleAncestorAtDepth(
      target.parentPageId,
      previewDepth,
      visibleRows
    );
    if (!ancestor) {
      return target;
    }

    return {
      kind: "sibling",
      parentId: ancestor.parentId,
      edge: "after",
      anchorPageId: ancestor.pageId,
    };
  }

  const anchorRow = visibleRows.find(
    (row) => row.pageId === target.anchorPageId
  );
  if (!anchorRow || previewDepth >= anchorRow.depth) {
    return target;
  }

  const ancestor = findVisibleAncestorAtDepth(
    target.anchorPageId,
    previewDepth,
    visibleRows
  );
  if (!ancestor) {
    return target;
  }

  return {
    kind: "sibling",
    parentId: ancestor.parentId,
    edge: target.edge,
    anchorPageId: ancestor.pageId,
  };
}
