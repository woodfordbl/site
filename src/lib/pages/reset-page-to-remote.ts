import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { deleteAllBlocksForPage } from "@/db/queries/block-collection-ops.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { syncPageListLocalPreviewFromCollection } from "@/lib/pages/page-list-local-preview-cookie.ts";

/** Removes all local overlay state for one page and restores the shipped baseline on next read. */
export function resetPageToRemote(pageId: string): void {
  const localPage =
    localPagesCollection.toArray.find((page) => page.id === pageId) ?? null;

  if (localPage) {
    localPagesCollection.delete(pageId);
  }

  deleteAllBlocksForPage(readBlockShardForPage(pageId));
  markPageClean(pageId);
  syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
}
