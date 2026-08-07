import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";

/**
 * Pure helpers over `{ t, v }` field-history series — used by live-markets
 * derived Change / Market cap and by coverage-aware formula helpers.
 */

/** Latest sample in an ascending series, or `null` when empty. */
export function latestSeriesPoint(
  points: readonly FieldHistoryPoint[]
): FieldHistoryPoint | null {
  return points.at(-1) ?? null;
}

/** Latest numeric value, or `null` when empty. */
export function latestSeriesValue(
  points: readonly FieldHistoryPoint[]
): number | null {
  const point = latestSeriesPoint(points);
  return point ? point.v : null;
}

/**
 * Value at-or-before `timestampMs` (binary search). Returns `null` when no
 * point is at or before the target — caller should ensure coverage first.
 */
export function valueAtSeries(
  points: readonly FieldHistoryPoint[],
  timestampMs: number
): number | null {
  if (points.length === 0 || !Number.isFinite(timestampMs)) {
    return null;
  }
  let lo = 0;
  let hi = points.length - 1;
  let best: FieldHistoryPoint | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const point = points[mid];
    if (point.t <= timestampMs) {
      best = point;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best ? best.v : null;
}

/**
 * Fractional change over `windowMs` ending at `nowMs`:
 * `(latest - valueAt(now - window)) / valueAt`. `null` when either sample is
 * missing or the reference is zero.
 */
export function pctChangeFromSeries(
  points: readonly FieldHistoryPoint[],
  windowMs: number,
  nowMs: number,
  latestOverride?: number | null
): number | null {
  if (!(Number.isFinite(windowMs) && windowMs > 0 && Number.isFinite(nowMs))) {
    return null;
  }
  const latest =
    latestOverride !== undefined && latestOverride !== null
      ? latestOverride
      : latestSeriesValue(points);
  const reference = valueAtSeries(points, nowMs - windowMs);
  if (
    latest === null ||
    reference === null ||
    !Number.isFinite(latest) ||
    !Number.isFinite(reference) ||
    reference === 0
  ) {
    return null;
  }
  return (latest - reference) / reference;
}

/** Market cap from float × latest price when both are finite. */
export function marketCapFromFloatAndPrice(
  floatShares: number | null | undefined,
  price: number | null | undefined
): number | null {
  if (
    typeof floatShares !== "number" ||
    typeof price !== "number" ||
    !Number.isFinite(floatShares) ||
    !Number.isFinite(price) ||
    floatShares <= 0
  ) {
    return null;
  }
  return floatShares * price;
}
