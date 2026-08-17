import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import { detectClosedPeriods } from "@/lib/charts/session-time-scale.ts";
import type { HistoryResolution } from "@/lib/connectors/types.ts";

/**
 * Pure helpers for time-axis charts: window presets, resolution selection, and
 * the fetch/display ranges a window resolves to. Historical backfill + local
 * capture are merged into the field-history store by
 * {@link ensureSeriesCoverageMany} (shared with live-markets derived Change);
 * this module stays IO-free.
 *
 * Every window but the shortest is a plain lookback from "now". The day window
 * is not: it is the *calendar day so far*, so an intraday chart reads as the
 * trend of today's session rather than as a 24-hour tail sliced through
 * yesterday afternoon. See {@link windowFetchRange} and
 * {@link windowDisplayRange} — the two differ because the day window has to
 * fetch past its own left edge to have a session to fall back to when today
 * has no observations yet (a weekend, a holiday, pre-market).
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

/**
 * The preset whose range is a calendar day rather than a lookback.
 * {@link windowFetchRange} and {@link windowDisplayRange} branch on it.
 */
const DAY_WINDOW_ID = "1D";

/**
 * Window control options, shortest → longest. The day window's `5m` resolution
 * matches the field-history store's own hourly tier (`HISTORY_TIERS`), which
 * coarsens anything over an hour old to one point per five minutes — asking a
 * provider for finer candles would buy detail the store immediately discards.
 * Inside that last hour the store keeps its 15s capture, so the right edge
 * still advances with live ticks.
 */
export const TIME_WINDOW_PRESETS: readonly TimeWindowPreset[] = [
  { id: DAY_WINDOW_ID, label: "1D", windowMs: DAY_MS, resolution: "5m" },
  { id: "7D", label: "7D", windowMs: 7 * DAY_MS, resolution: "1h" },
  { id: "30D", label: "30D", windowMs: 30 * DAY_MS, resolution: "4h" },
  { id: "1Y", label: "1Y", windowMs: 365 * DAY_MS, resolution: "1d" },
];

/** Default visible window when a chart hasn't chosen one (7 days). */
export const DEFAULT_TIME_WINDOW_MS = 7 * DAY_MS;

/**
 * How far before today the day window still fetches. Nothing of it is shown
 * while today has observations; it exists so a chart opened over a weekend, a
 * holiday, or before the opening bell can fall back to the most recent session
 * instead of rendering empty. Five days clears a long weekend.
 */
const DAY_WINDOW_BACKSTOP_MS = 5 * DAY_MS;

/** A resolved `[from, to]` range in epoch milliseconds. */
export interface TimeWindowRange {
  from: number;
  to: number;
}

/** True when `windowMs` selects the calendar-day preset. */
export function isDayWindow(windowMs: number): boolean {
  return presetForWindow(windowMs).id === DAY_WINDOW_ID;
}

/** Local midnight at or before `now`. */
function startOfLocalDay(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Where the visible day starts, given every timestamp the series cover.
 *
 * Today, whenever today has an observation. Otherwise the most recent session
 * present — the run of samples after the last inferred closure — so a chart
 * opened outside market hours shows the last day that traded rather than an
 * empty plot.
 */
function dayWindowStart(timestamps: readonly number[], now: number): number {
  const today = startOfLocalDay(now);
  if (timestamps.length === 0 || timestamps.some((t) => t >= today)) {
    return today;
  }
  const lastClosure = detectClosedPeriods(timestamps).at(-1);
  return lastClosure?.to ?? Math.min(...timestamps);
}

/**
 * Range to backfill and read for `windowMs` at `now`. Wider than the visible
 * range for the day window only, by {@link DAY_WINDOW_BACKSTOP_MS}.
 */
export function windowFetchRange(
  windowMs: number,
  now: number
): TimeWindowRange {
  if (isDayWindow(windowMs)) {
    return { from: startOfLocalDay(now) - DAY_WINDOW_BACKSTOP_MS, to: now };
  }
  return { from: now - windowMs, to: now };
}

/**
 * Visible range for `windowMs` at `now`, given the timestamps actually
 * covered. Identical to {@link windowFetchRange} except for the day window,
 * which starts at today's midnight (or the last session that has data).
 */
export function windowDisplayRange(
  windowMs: number,
  timestamps: readonly number[],
  now: number
): TimeWindowRange {
  if (isDayWindow(windowMs)) {
    return { from: dayWindowStart(timestamps, now), to: now };
  }
  return { from: now - windowMs, to: now };
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

/**
 * The cadence a window's backfill lands on.
 *
 * Closure detection needs this as a floor rather than trusting the sample
 * spacing it can see. The field-history store keeps a far finer local capture
 * for the last hour (15s) than the candles behind it, so a merged series
 * carries two cadences and its *median* gap collapses onto the fine one — at
 * which point every ordinary candle-to-candle step looks like a market
 * closure, and an intraday chart fills with seams over an axis that has
 * compressed away most of its own day.
 */
export function windowSampleSpacingMs(windowMs: number): number {
  return resolutionSpacingMs(resolutionForWindow(windowMs));
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

/** Clip a stitched series to the visible `[from, to]` window. */
export function clipToWindow(
  points: readonly FieldHistoryPoint[],
  from: number,
  to: number
): FieldHistoryPoint[] {
  return points.filter((point) => point.t >= from && point.t <= to);
}
