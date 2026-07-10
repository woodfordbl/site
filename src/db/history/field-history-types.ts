/**
 * Shared types and retention bounds for the field-history store — the
 * forward-only `{ t, v }` time series captured for numeric synced fields
 * flagged `captureHistory`. The store (`field-history-store.ts`) persists these
 * to IndexedDB; the pure thinning (`thin-field-history.ts`) coarsens them.
 */

/** One recorded sample: `t` = epoch milliseconds, `v` = numeric value. */
export interface FieldHistoryPoint {
  t: number;
  v: number;
}

/** A single field's captured series for one row (ordered oldest → newest). */
export interface FieldHistorySeries {
  databaseId: string;
  externalId: string;
  fieldId: string;
  points: FieldHistoryPoint[];
}

/** Hard cap on points per series after thinning (recency-biased). */
export const MAX_POINTS_PER_SERIES = 2000;

/**
 * Coarse bucket width by sample age — recent history stays dense, older
 * history collapses to one point per ever-larger window. Keeps a symbol
 * streaming all day from blowing the IndexedDB quota.
 */
export const HISTORY_TIERS = {
  /** < 1h old: one point per 15s. */
  recentMaxAgeMs: 3_600_000,
  recentBucketMs: 15_000,
  /** 1h–1d old: one point per 5m. */
  hourlyMaxAgeMs: 86_400_000,
  hourlyBucketMs: 300_000,
  /** 1d–30d old: one point per hour. */
  dailyMaxAgeMs: 2_592_000_000,
  dailyBucketMs: 3_600_000,
  /** 30d+ old: one point per day. */
  archiveBucketMs: 86_400_000,
} as const;
