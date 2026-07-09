import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import type { HistoryResolution } from "@/lib/connectors/types.ts";

/**
 * Pure helpers for time-axis charts: window presets, resolution selection, and
 * the three-layer stitch (provider backfill under finer local capture). No IO —
 * the async loading (field-history store + connector `fetchHistory`) lives in
 * `use-time-series-chart-data.ts`.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** One time-window choice for the chart's window control. */
export interface TimeWindowPreset {
  id: string;
  label: string;
  /** Candle resolution used to backfill this window (bounds point count). */
  resolution: HistoryResolution;
  windowMs: number;
}

/** Live window: the last 15 minutes, seeded by 1m candles and then extended by
 * the forward-only local capture as ticks arrive. */
const LIVE_WINDOW_MS = 15 * MINUTE_MS;

/** Window control options, shortest → longest. `Live` scrolls in real time. */
export const TIME_WINDOW_PRESETS: readonly TimeWindowPreset[] = [
  { id: "LIVE", label: "Live", windowMs: LIVE_WINDOW_MS, resolution: "1m" },
  { id: "1D", label: "1D", windowMs: DAY_MS, resolution: "5m" },
  { id: "7D", label: "7D", windowMs: 7 * DAY_MS, resolution: "1h" },
  { id: "30D", label: "30D", windowMs: 30 * DAY_MS, resolution: "4h" },
  { id: "1Y", label: "1Y", windowMs: 365 * DAY_MS, resolution: "1d" },
];

/** Default visible window when a chart hasn't chosen one (7 days). */
export const DEFAULT_TIME_WINDOW_MS = 7 * DAY_MS;

/** The finest cadence the local field-history capture retains (its recent
 * tier). Live/short windows dedupe at this bucket so real-time ticks aren't
 * collapsed into the coarser backfill resolution. */
const LIVE_CAPTURE_BUCKET_MS = 15_000;

/**
 * Display dedupe bucket for a window's stitched series. Long windows bucket at
 * the backfill candle resolution (bounds point count); short "live" windows
 * (≤ 1h) bucket at the fine local-capture cadence instead, so the sub-minute
 * ticks that make the chart *move* survive the merge rather than collapsing to
 * one point per candle.
 */
export function stitchBucketMs(windowMs: number): number {
  const resolutionMs = resolutionSpacingMs(resolutionForWindow(windowMs));
  if (windowMs <= HOUR_MS) {
    return Math.min(resolutionMs, LIVE_CAPTURE_BUCKET_MS);
  }
  return resolutionMs;
}

/** Nearest preset for a window (for resolution + control highlighting). */
export function presetForWindow(windowMs: number): TimeWindowPreset {
  let best = TIME_WINDOW_PRESETS[0];
  let bestGap = Number.POSITIVE_INFINITY;
  for (const preset of TIME_WINDOW_PRESETS) {
    const gap = Math.abs(preset.windowMs - windowMs);
    if (gap < bestGap) {
      bestGap = gap;
      best = preset;
    }
  }
  return best;
}

/** Candle resolution for a window (finer for short, coarser for long). */
export function resolutionForWindow(windowMs: number): HistoryResolution {
  return presetForWindow(windowMs).resolution;
}

/** Approximate ms per candle for a resolution (backfill spacing / dedupe). */
export function resolutionSpacingMs(resolution: HistoryResolution): number {
  switch (resolution) {
    case "1m":
      return MINUTE_MS;
    case "5m":
      return 5 * MINUTE_MS;
    case "15m":
      return 15 * MINUTE_MS;
    case "1h":
      return HOUR_MS;
    case "4h":
      return 4 * HOUR_MS;
    default:
      return DAY_MS;
  }
}

/**
 * Stitch provider backfill under local capture, finest-fidelity-wins:
 * backfill points are clipped to strictly before the earliest local point (so
 * finer local data owns the overlap), then concatenated with local, sorted,
 * and deduped so only the newest value survives per time bucket. Both inputs
 * may be empty. Result ascends by `t`.
 */
export function stitchSeries(
  backfill: readonly FieldHistoryPoint[],
  local: readonly FieldHistoryPoint[],
  bucketMs: number
): FieldHistoryPoint[] {
  const earliestLocal =
    local.length > 0 ? local[0].t : Number.POSITIVE_INFINITY;
  const clippedBackfill = backfill.filter((point) => point.t < earliestLocal);
  const merged = [...clippedBackfill, ...local].sort((a, b) => a.t - b.t);

  if (merged.length === 0) {
    return [];
  }

  // Collapse to one point per bucket (newest wins), preserving ascending order.
  const width = Math.max(1, bucketMs);
  const byBucket = new Map<number, FieldHistoryPoint>();
  for (const point of merged) {
    byBucket.set(Math.floor(point.t / width), point);
  }
  return [...byBucket.values()].sort((a, b) => a.t - b.t);
}

/** Clip a stitched series to the visible `[from, to]` window. */
export function clipToWindow(
  points: readonly FieldHistoryPoint[],
  from: number,
  to: number
): FieldHistoryPoint[] {
  return points.filter((point) => point.t >= from && point.t <= to);
}
