import type { PageSummary } from "@/lib/content/list-pages.ts";
import { assertCanReposition } from "@/lib/pages/reposition-page.ts";

/** HTML5 drag MIME the sidebar page-list writes (and the canvas reads for drops). */
export const PAGE_DRAG_MIME_TYPE = "application/x-page-id";

/**
 * Whether a sidebar page may be dropped into a page's canvas — i.e. re-nested
 * under it. Rejects self-drops and reuses {@link assertCanReposition} so the
 * cycle (ancestor/descendant), home-page, and {@link MAX_PAGE_DEPTH} guards match
 * the sidebar exactly.
 */
export function canDropPageIntoCanvas(options: {
  currentPageId: string;
  droppedPageId: string;
  pages: PageSummary[];
}): boolean {
  const { currentPageId, droppedPageId, pages } = options;

  if (droppedPageId === currentPageId) {
    return false;
  }

  try {
    assertCanReposition({
      pageId: droppedPageId,
      parentId: currentPageId,
      pages,
    });
    return true;
  } catch {
    return false;
  }
}
