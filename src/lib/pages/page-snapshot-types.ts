import type { Block } from "@/lib/schemas/block.ts";
import type { PageFont, PageTextScale } from "@/lib/schemas/page-settings.ts";

/** Wall-clock window size that collapses a burst of edits into one checkpoint. */
export const SNAPSHOT_BUCKET_MS = 600_000; // 10 minutes

/** Hard upper bound on retained checkpoints per page (see thin-page-snapshots). */
export const MAX_SNAPSHOTS_PER_PAGE = 40;

/**
 * Lightweight checkpoint descriptor stored in the per-page snapshot index.
 * Small enough to list the whole timeline without loading any block content.
 */
export interface PageSnapshotDescriptor {
  blockCount: number;
  /** `Math.floor(epochMs / SNAPSHOT_BUCKET_MS)` of the capture time. */
  bucketId: number;
  /** `hashPageBlocks` of the captured blocks — dedupe + skip-unchanged. */
  contentHash: string;
  /** Stable id; also the suffix of the heavy content key. */
  id: string;
  /** `hashPageMetadata` of title/icon/settings — detects metadata-only edits. */
  metadataHash: string;
  /** ISO timestamp of the window end-state (advances when a bucket coalesces). */
  timestamp: string;
  /** Denormalized page title so the timeline can label rows without a content read. */
  title: string;
  wordCount: number;
}

/** Heavy per-checkpoint payload — one IndexedDB key each, read only on restore. */
export interface PageSnapshotContent {
  blockOrder: string[];
  blocks: Block[];
  icon?: string;
  id: string;
  settings: {
    font?: PageFont;
    textScale?: PageTextScale;
  };
  title: string;
}

/** Per-page index value: the full descriptor list, sorted ascending by timestamp. */
export interface PageSnapshotIndex {
  descriptors: PageSnapshotDescriptor[];
  pageId: string;
}
