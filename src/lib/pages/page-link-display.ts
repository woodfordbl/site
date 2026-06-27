import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { PageLinkProps } from "@/lib/schemas/block-props.ts";

/** Underline for inline `pageLink` titles in the canvas (border token, not text color). */
export const pageTitleUnderlineClassName =
  "underline underline-offset-4 decoration-border";

/**
 * Whether a `pageLink` row should show the arrow-up-right icon.
 * Relational rule (primary): a block is a subpage (no arrow) only when the canvas it
 * lives in is the target page's current parent; everywhere else it's a link (arrow).
 * This makes moves auto-correct — a moved page's old-parent link grows the arrow and
 * its new-parent link drops it, with no block writes. Stored `props.variant` is used
 * only as an SSR/unknown fallback when the target or canvas id is not yet resolved.
 * @see docs/architecture/pages.md#page-links
 */
export function pageLinkShowsExternalIcon(
  props: PageLinkProps,
  targetPage: PageSummary | null,
  canvasPageId: string | null
): boolean {
  if (targetPage && canvasPageId) {
    return targetPage.parentId !== canvasPageId;
  }

  if (props.variant === "child") {
    return false;
  }

  if (props.variant === "linked") {
    return true;
  }

  return false;
}
