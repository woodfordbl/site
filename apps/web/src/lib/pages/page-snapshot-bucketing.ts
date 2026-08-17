import { SNAPSHOT_BUCKET_MS } from "@/lib/pages/page-snapshot-types.ts";

/**
 * The 10-minute wall-clock bucket an instant falls into. Edits within the same
 * bucket collapse to a single checkpoint capturing that window's end-state.
 */
export function bucketIdForTimestamp(epochMs: number): number {
  return Math.floor(epochMs / SNAPSHOT_BUCKET_MS);
}
