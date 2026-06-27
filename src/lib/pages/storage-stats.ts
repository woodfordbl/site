import { readAllPageActivityEvents } from "@/db/activity/page-activity-store.ts";
import { getAsset, listAssetKeys } from "@/db/assets/asset-store.ts";
import { getBrowserStorage } from "@/db/collections/browser-storage.ts";
import { BLOCK_SHARD_PREFIX } from "@/db/collections/page-sharded-block-storage.ts";
import {
  listSnapshotPageIds,
  readSnapshotContent,
  readSnapshotIndex,
} from "@/db/snapshots/page-snapshot-store.ts";

export type StorageCategoryKey =
  | "blocks"
  | "pages"
  | "snapshots"
  | "assets"
  | "activity"
  | "other";

export interface StorageCategory {
  bytes: number;
  key: StorageCategoryKey;
  label: string;
}

export interface AssetTypeBreakdown {
  bytes: number;
  count: number;
  key: string;
  label: string;
}

export interface LargestAsset {
  bytes: number;
  id: string;
  type: string;
}

export interface StorageStats {
  assetBytes: number;
  assetCount: number;
  assetTypes: AssetTypeBreakdown[];
  categories: StorageCategory[];
  largestAssets: LargestAsset[];
  quota?: number;
  /** From `navigator.storage.estimate()`, when available. */
  quotaUsage?: number;
  snapshotCount: number;
  /** Sum of all category bytes that we measured directly. */
  totalTrackedBytes: number;
}

const PAGES_KEY = "site-local-pages";
const NAMESPACE_PREFIX = "site-";

/** UTF-8 byte length of a string. */
function byteLength(value: string): number {
  if (typeof Blob !== "undefined") {
    return new Blob([value]).size;
  }
  // Fallback heuristic for non-browser contexts.
  return value.length * 2;
}

function measureLocalStorage(): {
  blocks: number;
  pages: number;
  other: number;
} {
  const storage = getBrowserStorage();
  let blocks = 0;
  let pages = 0;
  let other = 0;

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) {
      continue;
    }
    const value = storage.getItem(key);
    if (value == null) {
      continue;
    }
    const size = byteLength(key) + byteLength(value);

    if (key.startsWith(BLOCK_SHARD_PREFIX)) {
      blocks += size;
    } else if (key === PAGES_KEY) {
      pages += size;
    } else if (key.startsWith(NAMESPACE_PREFIX)) {
      other += size;
    }
  }

  return { blocks, pages, other };
}

function classifyAssetType(mime: string): { key: string; label: string } {
  if (mime === "image/gif") {
    return { key: "gif", label: "GIFs" };
  }
  if (mime.startsWith("image/")) {
    return { key: "image", label: "Images" };
  }
  if (mime.startsWith("video/")) {
    return { key: "video", label: "Videos" };
  }
  if (mime.startsWith("audio/")) {
    return { key: "audio", label: "Audio" };
  }
  return { key: "other", label: "Other files" };
}

async function measureAssets(): Promise<{
  bytes: number;
  count: number;
  types: AssetTypeBreakdown[];
  largest: LargestAsset[];
}> {
  const ids = await listAssetKeys();
  const typeMap = new Map<string, AssetTypeBreakdown>();
  const sized: LargestAsset[] = [];
  let bytes = 0;

  const blobs = await Promise.all(ids.map((id) => getAsset(id)));

  ids.forEach((id, index) => {
    const blob = blobs[index];
    if (!blob) {
      return;
    }
    const type = blob.type || "application/octet-stream";
    bytes += blob.size;
    sized.push({ id, bytes: blob.size, type });

    const { key, label } = classifyAssetType(type);
    const entry = typeMap.get(key) ?? { key, label, count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += blob.size;
    typeMap.set(key, entry);
  });

  const types = [...typeMap.values()].sort((a, b) => b.bytes - a.bytes);
  const largest = sized.sort((a, b) => b.bytes - a.bytes).slice(0, 5);

  return { bytes, count: ids.length, types, largest };
}

async function measureSnapshots(): Promise<{ bytes: number; count: number }> {
  const pageIds = await listSnapshotPageIds();
  let bytes = 0;
  let count = 0;

  for (const pageId of pageIds) {
    const index = await readSnapshotIndex(pageId);
    bytes += byteLength(JSON.stringify(index));
    count += index.descriptors.length;

    const contents = await Promise.all(
      index.descriptors.map((descriptor) =>
        readSnapshotContent(pageId, descriptor.id)
      )
    );
    for (const content of contents) {
      if (content) {
        bytes += byteLength(JSON.stringify(content));
      }
    }
  }

  return { bytes, count };
}

async function measureActivity(): Promise<number> {
  const events = await readAllPageActivityEvents(Number.POSITIVE_INFINITY);
  if (events.length === 0) {
    return 0;
  }
  return byteLength(JSON.stringify(events));
}

async function readQuota(): Promise<{ quota?: number; usage?: number }> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return {};
  }
  try {
    const { quota, usage } = await navigator.storage.estimate();
    return { quota, usage };
  } catch {
    return {};
  }
}

/** Measures local-first storage footprint across localStorage and IndexedDB. */
export async function computeStorageStats(): Promise<StorageStats> {
  const local = measureLocalStorage();
  const [assets, snapshots, activityBytes, quota] = await Promise.all([
    measureAssets(),
    measureSnapshots(),
    measureActivity(),
    readQuota(),
  ]);

  const categories: StorageCategory[] = [
    { key: "assets", label: "Media assets", bytes: assets.bytes },
    { key: "snapshots", label: "Version history", bytes: snapshots.bytes },
    { key: "blocks", label: "Page content", bytes: local.blocks },
    { key: "activity", label: "Activity log", bytes: activityBytes },
    { key: "pages", label: "Page metadata", bytes: local.pages },
    { key: "other", label: "Other", bytes: local.other },
  ];

  const totalTrackedBytes = categories.reduce(
    (sum, category) => sum + category.bytes,
    0
  );

  return {
    categories: categories
      .filter((category) => category.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes),
    totalTrackedBytes,
    quota: quota.quota,
    quotaUsage: quota.usage,
    assetCount: assets.count,
    assetBytes: assets.bytes,
    assetTypes: assets.types,
    largestAssets: assets.largest,
    snapshotCount: snapshots.count,
  };
}
