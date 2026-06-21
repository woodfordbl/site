import {
  deleteAsset,
  listAssetKeys,
  wasAssetPutThisSession,
} from "@/db/assets/asset-store.ts";
import { getBrowserStorage } from "@/db/collections/browser-storage.ts";
import { BLOCK_SHARD_PREFIX } from "@/db/collections/page-sharded-block-storage.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
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

/** Deletes IndexedDB blobs not referenced by any local media block. */
export async function sweepOrphanAssets(
  storage: Storage = getBrowserStorage()
): Promise<number> {
  const referenced = collectReferencedAssetIds(storage);
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
