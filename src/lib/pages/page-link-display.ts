import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { PageLinkProps } from "@/lib/schemas/block-props.ts";

/** Underline for inline `pageLink` titles in the canvas (border token, not text color). */
export const pageTitleUnderlineClassName =
  "underline underline-offset-4 decoration-border";

/**
 * Whether a `pageLink` row should show the arrow-up-right icon.
 * `variant: linked` always shows; `variant: child` never does.
 * Legacy blocks without `variant` compare `targetPage.parentId` to `canvasPageId`.
 * @see docs/architecture/pages.md#page-links
 */
export function pageLinkShowsExternalIcon(
  props: PageLinkProps,
  targetPage: PageSummary | null,
  canvasPageId: string | null
): boolean {
  if (props.variant === "child") {
    return false;
  }

  if (props.variant === "linked") {
    return true;
  }

  if (!(targetPage && canvasPageId)) {
    return false;
  }

  return targetPage.parentId !== canvasPageId;
}
