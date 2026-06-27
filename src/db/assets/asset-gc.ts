import {
  deleteAsset,
  listAssetKeys,
  wasAssetPutThisSession,
} from "@/db/assets/asset-store.ts";
import { getBrowserStorage } from "@/db/collections/browser-storage.ts";
import { BLOCK_SHARD_PREFIX } from "@/db/collections/page-sharded-block-storage.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import {
  listSnapshotPageIds,
  readSnapshotContent,
  readSnapshotIndex,
} from "@/db/snapshots/page-snapshot-store.ts";
import type { Block } from "@/lib/schemas/block.ts";

function collectAssetIdsFromBlocks(blocks: Block[]): Set<string> {
  const referenced = new Set<string>();
  for (const block of blocks) {
    if (
      block.type === "media" &&
      block.props.source === "asset" &&
      block.props.src
    ) {
      referenced.add(block.props.src);
    }
  }
  return referenced;
}

/** Scans all local block shards for content-addressed media asset ids. */
export function collectReferencedAssetIds(
  storage: Storage = getBrowserStorage()
): Set<string> {
  const referenced = new Set<string>();

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(BLOCK_SHARD_PREFIX)) {
      continue;
    }
    const pageId = key.slice(BLOCK_SHARD_PREFIX.length);
    const blocks = readBlockShardForPage(pageId, storage);
    for (const assetId of collectAssetIdsFromBlocks(blocks)) {
      referenced.add(assetId);
    }
  }

  return referenced;
}

/**
 * Media asset ids referenced by stored version-history snapshots. A blob that a
 * snapshot still points at must survive the sweep even when no live block uses
 * it, so restoring that checkpoint keeps its media.
 */
async function collectSnapshotAssetIds(): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (const pageId of await listSnapshotPageIds()) {
    const index = await readSnapshotIndex(pageId);
    for (const descriptor of index.descriptors) {
      const content = await readSnapshotContent(pageId, descriptor.id);
      if (!content) {
        continue;
      }
      for (const assetId of collectAssetIdsFromBlocks(content.blocks)) {
        referenced.add(assetId);
      }
    }
  }
  return referenced;
}

/** Deletes IndexedDB blobs not referenced by any local media block or snapshot. */
export async function sweepOrphanAssets(
  storage: Storage = getBrowserStorage()
): Promise<number> {
  const referenced = collectReferencedAssetIds(storage);
  for (const assetId of await collectSnapshotAssetIds()) {
    referenced.add(assetId);
  }
  const storedKeys = await listAssetKeys();
  let removed = 0;

  for (const assetId of storedKeys) {
    if (referenced.has(assetId) || wasAssetPutThisSession(assetId)) {
      continue;
    }
    await deleteAsset(assetId);
    removed += 1;
  }

  return removed;
}
