import { sweepOrphanAssets } from "@/db/assets/asset-gc.ts";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardPageIds } from "@/db/collections/page-sharded-block-storage.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { deleteAllBlocksForPage } from "@/db/queries/block-collection-ops.ts";
import { clearPageSnapshots } from "@/db/snapshots/page-snapshot-store.ts";
import { clearAllPageEditHistories } from "@/lib/canvas/page-edit-history.ts";
import { writeDirtyPageIdsToDocument } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { writePageListLocalPreviewToDocument } from "@/lib/pages/page-list-local-preview-cookie.ts";

/** Clears all local page metadata, block shards, and SSR hint cookies. */
export async function resetAllToRemote(): Promise<void> {
  for (const page of localPagesCollection.toArray) {
    clearPageSnapshots(page.id).catch(() => undefined);
    localPagesCollection.delete(page.id);
  }

  for (const pageId of readBlockShardPageIds()) {
    deleteAllBlocksForPage(readBlockShardForPage(pageId));
  }

  clearAllPageEditHistories();
  writeDirtyPageIdsToDocument(new Set());
  writePageListLocalPreviewToDocument([]);
  await sweepOrphanAssets();
}
