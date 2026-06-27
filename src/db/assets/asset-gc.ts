import {
  deleteAsset,
  listAssetKeys,
  wasAssetPutThisSession,
} from "@/db/assets/asset-store.ts";
import { getBrowserStorage } from "@/db/collections/browser-storage.ts";
import { BLOCK_SHARD_PREFIX } from "@/db/collections/page-sharded-block-storage.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import type { Block } from "@/lib/schemas/block.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";

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

/**
 * Cover ("header") images can be content-addressed asset uploads referenced from
 * a local page document's `headerImage` (not from any block), so the sweep must
 * treat them as live or it would reclaim an uploaded cover on the next boot.
 */
function collectCoverAssetIds(storage: Storage): Set<string> {
  const referenced = new Set<string>();
  const raw = storage.getItem(LOCAL_PAGES_STORAGE_KEY);
  if (!raw) {
    return referenced;
  }
  try {
    const parsed = JSON.parse(raw) as Record<
      string,
      { data?: { headerImage?: { source?: string; src?: string } } }
    >;
    for (const stored of Object.values(parsed)) {
      const headerImage = stored?.data?.headerImage;
      if (headerImage?.source === "asset" && headerImage.src) {
        referenced.add(headerImage.src);
      }
    }
  } catch {
    // Malformed local-pages blob: treat as no cover references.
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

  for (const assetId of collectCoverAssetIds(storage)) {
    referenced.add(assetId);
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
