import { toast } from "sonner";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import {
  applyPageBlockDiff,
  beginPageBlockTransaction,
  commitPageBlockTransaction,
} from "@/db/queries/block-collection-ops.ts";
import {
  deleteSnapshotContent,
  readSnapshotContent,
  readSnapshotIndex,
  writeSnapshotIndex,
} from "@/db/snapshots/page-snapshot-store.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import { recordPageEditHistory } from "@/lib/canvas/page-edit-history.ts";
import { markPageDirty } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { formatRelativeTime } from "@/lib/pages/format-relative-time.ts";
import { syncPageListLocalPreviewFromCollection } from "@/lib/pages/page-list-local-preview-cookie.ts";
import type { PageSnapshotContent } from "@/lib/pages/page-snapshot-types.ts";
import { blocksFromLocalBlocks } from "@/lib/schemas/local-block.ts";

function restorePageMetadata(
  pageId: string,
  content: PageSnapshotContent
): void {
  const exists = localPagesCollection.toArray.some(
    (page) => page.id === pageId
  );
  if (!exists) {
    return;
  }

  localPagesCollection.update(pageId, (draft) => {
    draft.title = content.title;
    draft.icon = content.icon;
    draft.font = content.settings.font;
    draft.textScale = content.settings.textScale;
    draft.updatedAt = new Date().toISOString();
  });
  markPageDirty(pageId);
  syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
}

/**
 * Drops every checkpoint newer than the restored one — restoring rewinds the
 * timeline, so the future (the versions between the restored point and now) is
 * discarded. The restored checkpoint and everything older are kept.
 */
async function purgeSnapshotsAfterRestore(
  pageId: string,
  snapshotId: string
): Promise<void> {
  const index = await readSnapshotIndex(pageId);
  const restored = index.descriptors.find(
    (descriptor) => descriptor.id === snapshotId
  );
  if (!restored) {
    return;
  }

  const cutoff = Date.parse(restored.timestamp);
  const drop = index.descriptors.filter(
    (descriptor) => Date.parse(descriptor.timestamp) > cutoff
  );
  if (drop.length === 0) {
    return;
  }

  const keep = index.descriptors.filter(
    (descriptor) => Date.parse(descriptor.timestamp) <= cutoff
  );
  await Promise.all(
    drop.map((descriptor) => deleteSnapshotContent(pageId, descriptor.id))
  );
  await writeSnapshotIndex({ pageId, descriptors: keep });
}

/**
 * Reverts a page to an earlier checkpoint's full state (blocks + order + title +
 * icon + settings), then purges all history newer than that checkpoint.
 */
export async function restorePageSnapshot(
  pageId: string,
  snapshotId: string,
  capturedAt?: string
): Promise<void> {
  try {
    const content = await readSnapshotContent(pageId, snapshotId);
    if (!content) {
      toast.error("That version is no longer available.");
      return;
    }

    // Apply blocks + order atomically (ordering invariant).
    const existing = readBlockShardForPage(pageId);

    // Restoring is itself a Ctrl+Z-able edit: record the pre-restore state.
    const blockOrder = localPagesCollection.toArray.find(
      (page) => page.id === pageId
    )?.blockOrder;
    recordPageEditHistory(
      pageId,
      orderBlocksByIds(blocksFromLocalBlocks(existing), blockOrder)
    );

    const tx = beginPageBlockTransaction(
      pageId,
      existing.map((block) => block.id)
    );
    applyPageBlockDiff(
      pageId,
      blocksFromLocalBlocks(existing),
      content.blocks,
      existing,
      { tx }
    );
    commitPageBlockTransaction(tx);

    restorePageMetadata(pageId, content);

    // Rewind the timeline: discard every checkpoint after the restored one.
    await purgeSnapshotsAfterRestore(pageId, snapshotId);

    toast.success(
      capturedAt
        ? `Restored version from ${formatRelativeTime(capturedAt)}`
        : "Restored earlier version"
    );
  } catch (error) {
    reportPersistenceError(error);
  }
}
