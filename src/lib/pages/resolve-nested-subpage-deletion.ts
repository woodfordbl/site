import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowById } from "@/lib/blocks/block-tree.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";

/**
 * Resolves the page id that deleting a row should delete instead of the block,
 * or `null` to fall back to a plain block delete.
 *
 * A row qualifies only when it is a `pageLink` block whose target page is a
 * nested subpage of the canvas being edited — i.e. the target's `parentId`
 * equals `currentPageId`. This mirrors the relational subpage rule used for the
 * page-link external-icon (a link is a subpage only inside its parent canvas),
 * so deleting it removes the page (and its descendants) with a confirmation,
 * while plain links to pages elsewhere keep the normal block delete.
 *
 * @see docs/architecture/pages.md#page-links
 */
export function resolveNestedSubpageDeletion(
  rows: CanvasRow[],
  rowId: string,
  pages: PageSummary[],
  currentPageId: string
): string | null {
  const block = findRowById(rows, rowId)?.effectiveBlock;
  if (block?.type !== "pageLink") {
    return null;
  }

  const targetPage = pages.find((page) => page.id === block.props.pageId);
  if (!targetPage || targetPage.parentId !== currentPageId) {
    return null;
  }

  return targetPage.id;
}
