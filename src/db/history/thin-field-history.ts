import {
  type FieldHistoryPoint,
  HISTORY_TIERS,
  MAX_POINTS_PER_SERIES,
} from "@/db/history/field-history-types.ts";

/**
 * Tiered "coarsen over time" retention for a field-history series, mirroring
 * the page-snapshot thinning: collapse each coarse time bucket to its newest
 * point (recent history dense, old history sparse), then enforce a hard cap
 * (dropping oldest survivors). The single most-recent point is always kept.
 * Pure — no IndexedDB.
 */

/** Bucket width for a point based on its age relative to `nowMs`. */
function bucketWidthForAge(ageMs: number): number {
  if (ageMs < HISTORY_TIERS.recentMaxAgeMs) {
    return HISTORY_TIERS.recentBucketMs;
  }
  if (ageMs < HISTORY_TIERS.hourlyMaxAgeMs) {
    return HISTORY_TIERS.hourlyBucketMs;
  }
  if (ageMs < HISTORY_TIERS.dailyMaxAgeMs) {
    return HISTORY_TIERS.dailyBucketMs;
  }
  return HISTORY_TIERS.archiveBucketMs;
}

export function thinFieldHistory(
  points: FieldHistoryPoint[],
  nowMs: number
): FieldHistoryPoint[] {
  if (points.length <= 1) {
    return points;
  }

  const sorted = [...points].sort((a, b) => a.t - b.t);

  // Newest point per coarse bucket wins (later entries overwrite the slot).
  const byBucket = new Map<string, FieldHistoryPoint>();
  for (const point of sorted) {
    const width = bucketWidthForAge(nowMs - point.t);
    byBucket.set(`${width}:${Math.floor(point.t / width)}`, point);
  }

  const kept = [...byBucket.values()].sort((a, b) => a.t - b.t);
  const mostRecent = sorted.at(-1);
  if (mostRecent && kept.at(-1) !== mostRecent) {
    kept.push(mostRecent);
  }

  // Hard cap: keep the most-recent `MAX_POINTS_PER_SERIES` (drop oldest).
  if (kept.length > MAX_POINTS_PER_SERIES) {
    return kept.slice(kept.length - MAX_POINTS_PER_SERIES);
  }
  return kept;
}
