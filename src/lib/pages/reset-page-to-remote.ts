import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { deleteAllBlocksForPage } from "@/db/queries/block-collection-ops.ts";
import { clearPageBaseline } from "@/db/snapshots/page-baseline-store.ts";
import { clearPageSnapshots } from "@/db/snapshots/page-snapshot-store.ts";
import { clearPageEditHistory } from "@/lib/canvas/page-edit-history.ts";
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
  clearPageEditHistory(pageId);
  clearPageSnapshots(pageId).catch(() => undefined);
  clearPageBaseline(pageId).catch(() => undefined);
  syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
}
