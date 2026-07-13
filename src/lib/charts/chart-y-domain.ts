import { scaleLinear } from "d3-scale";

/**
 * Shared Y-axis auto-domain so the Recharts (normal) and dither-kit (dithered)
 * renderers always agree on the same bounds. The rule keys off what the values
 * represent, not just their range:
 *
 * - **Zero-based** aggregates (count / sum) and stacked charts anchor the floor
 *   at 0 — bars/areas grow from a true baseline.
 * - **Level** aggregates (average / min / max) and time-series values zoom to
 *   the data band with a little padding, so variation in a narrow high band
 *   (e.g. a price hovering 812–867) stays readable instead of being squashed
 *   against 0.
 *
 * Explicit `yMin` / `yMax` always win for the side they set; the other side is
 * still auto-fit. Bounds are nice-rounded (via d3) so ticks land on round
 * values and there is a little headroom above the peak.
 */
export interface AutoYDomainOptions {
  /** Target tick count used for nice-rounding (default 4). */
  tickCount?: number;
  /** Every plotted magnitude (per-category stacked totals when stacked). */
  values: number[];
  /** Explicit upper bound; overrides the auto ceiling. */
  yMax?: number;
  /** Explicit lower bound; overrides the auto floor. */
  yMin?: number;
  /** Count/sum or stacked → anchor the floor at 0. */
  zeroBased: boolean;
}

export interface ResolvedYDomain {
  max: number;
  min: number;
}

export function resolveAutoYDomain({
  values,
  zeroBased,
  yMin,
  yMax,
  tickCount = 4,
}: AutoYDomainOptions): ResolvedYDomain {
  const finite = values.filter((v) => Number.isFinite(v));
  let dataMin = finite.length > 0 ? Math.min(...finite) : 0;
  const dataMax = finite.length > 0 ? Math.max(...finite) : 1;
  if (zeroBased) {
    dataMin = Math.min(0, dataMin);
  }

  let lo = yMin ?? dataMin;
  let hi = yMax ?? dataMax;
  if (lo === hi) {
    // Degenerate (all equal): open up a unit band so the bar/line is visible.
    hi = lo + Math.abs(lo || 1);
  }
  const span = hi - lo || 1;
  // Pad only the auto sides so an explicit bound is honoured exactly.
  if (yMin === undefined && !zeroBased) {
    lo -= span * 0.08;
  }
  if (yMax === undefined) {
    hi += span * (zeroBased ? 0.05 : 0.08);
  }

  const [niceLo, niceHi] = scaleLinear()
    .domain([lo, hi])
    .nice(tickCount)
    .domain();
  return {
    min: yMin ?? (zeroBased ? Math.min(0, niceLo) : niceLo),
    max: yMax ?? niceHi,
  };
}

/** Aggregates whose values are magnitudes and belong on a 0-based axis. */
export function isZeroBasedAggregate(aggregate: string): boolean {
  return aggregate === "count" || aggregate === "sum";
}
