import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { applyPageBlockDiff } from "@/db/queries/block-collection-ops.ts";
import { readPageBaseline } from "@/db/snapshots/page-baseline-store.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import { recordPageEditHistory } from "@/lib/canvas/page-edit-history.ts";
import { capturePageSnapshotNow } from "@/lib/pages/capture-page-snapshot.ts";
import { keepLocalPageVersion } from "@/lib/pages/keep-local-page-version.ts";
import { mergePageBlocks } from "@/lib/pages/merge-page-blocks.ts";
import { blocksFromLocalBlocks } from "@/lib/schemas/local-block.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
} from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";

export type MergeStalePageOutcome =
  | {
      status: "merged";
      /** Remote-driven changes applied. */
      tookRemote: number;
      /** Divergent blocks resolved to the local side. */
      conflicts: number;
      /** False when the local document already contained every remote change. */
      changed: boolean;
    }
  | { status: "no-local" }
  | { status: "no-baseline" };

/**
 * Resolves a stale overridden page by merging the newly shipped content into
 * the local overlay (three-way, per block id — see `mergePageBlocks`).
 * Local-side wins on divergent blocks; **shipped metadata changes are not
 * merged** (the baseline store keeps block content only), they are
 * acknowledged by the baseline fast-forward and local metadata keeps
 * rendering.
 *
 * Before applying, a forced version-history checkpoint and a session undo
 * entry are recorded — a bad merge is one restore (or Mod+Z) away, same as a
 * snapshot restore. Afterwards `keepLocalPageVersion` fast-forwards the
 * baselines (hashes + stored baseline blocks) so the page stops reporting a
 * conflict.
 *
 * Returns `no-baseline` when the overlay predates the baseline store — the
 * caller falls back to the coarse resolutions (keep / preview / reset).
 * Throws on apply failure; callers report via `reportPersistenceError`.
 */
export async function mergeStalePageFromServer(
  serverPage: Page
): Promise<MergeStalePageOutcome> {
  const localPage =
    localPagesCollection.toArray.find((page) => page.id === serverPage.id) ??
    null;

  if (
    !localPage ||
    isLocallyDeletedPage(localPage) ||
    isUserCreatedPage(localPage)
  ) {
    return { status: "no-local" };
  }

  const baseline = await readPageBaseline(serverPage.id);
  if (!baseline) {
    return { status: "no-baseline" };
  }

  const existing = readBlockShardForPage(serverPage.id);
  const localBlocks = orderBlocksByIds(
    blocksFromLocalBlocks(existing),
    localPage.blockOrder
  );

  const result = mergePageBlocks(
    baseline.blocks,
    localBlocks,
    serverPage.blocks
  );

  if (result.changed) {
    // Escape hatches first: a distinct version-history checkpoint and a
    // session undo entry, mirroring restore-page-snapshot.
    await capturePageSnapshotNow(serverPage.id, { force: true });
    recordPageEditHistory(serverPage.id, localBlocks);

    // Blocks + blockOrder commit atomically (ordering invariant).
    applyPageBlockDiff(serverPage.id, localBlocks, result.merged, existing);
  }

  keepLocalPageVersion(serverPage);

  return {
    status: "merged",
    tookRemote: result.tookRemote,
    conflicts: result.conflictBlockIds.length,
    changed: result.changed,
  };
}
