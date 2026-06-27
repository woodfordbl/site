import { toast } from "sonner";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import {
  applyPageBlockDiff,
  beginPageBlockTransaction,
  commitPageBlockTransaction,
} from "@/db/queries/block-collection-ops.ts";
import { readSnapshotContent } from "@/db/snapshots/page-snapshot-store.ts";
import { markPageDirty } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { capturePageSnapshotNow } from "@/lib/pages/capture-page-snapshot.ts";
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
    draft.smallText = content.settings.smallText;
    draft.updatedAt = new Date().toISOString();
  });
  markPageDirty(pageId);
  syncPageListLocalPreviewFromCollection(localPagesCollection.toArray);
}

/**
 * Reverts a page to an earlier checkpoint's full state (blocks + order + title +
 * icon + settings). Captures the current state first so the revert is itself
 * undoable from the version history.
 */
export async function restorePageSnapshot(
  pageId: string,
  snapshotId: string,
  capturedAt?: string
): Promise<void> {
  try {
    // Snapshot the current state so the user can undo the revert.
    await capturePageSnapshotNow(pageId, { force: true });

    const content = await readSnapshotContent(pageId, snapshotId);
    if (!content) {
      toast.error("That version is no longer available.");
      return;
    }

    // Apply blocks + order atomically (ordering invariant).
    const existing = readBlockShardForPage(pageId);
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

    toast.success(
      capturedAt
        ? `Restored version from ${formatRelativeTime(capturedAt)}`
        : "Restored earlier version"
    );
  } catch (error) {
    reportPersistenceError(error);
  }
}
