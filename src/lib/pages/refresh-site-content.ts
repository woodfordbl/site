import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { syncPageListLocalPreviewFromCollection } from "@/lib/pages/page-list-local-preview-cookie.ts";
import { resetPageToRemote } from "@/lib/pages/reset-page-to-remote.ts";

/**
 * Pulls newly-published shipped content for the given overridden pages by
 * dropping their local overlays so the next read restores the shipped baseline.
 * Unrelated local edits and user-created pages are untouched. New shipped pages
 * appear automatically via the catalog union, so they are not handled here.
 */
export function refreshSiteContent(stalePageIds: string[]): void {
  for (const pageId of stalePageIds) {
    resetPageToRemote(pageId);
  }

  syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
}
