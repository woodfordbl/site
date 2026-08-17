/**
 * @fileoverview A time scale that spends no width on periods with no data.
 *
 * A market closes. A sensor sleeps. A job runs on weekdays. Plotted on a plain
 * linear time scale, those closures are real distance: a weekend is 2/7ths of a
 * week's width carrying a single straight segment, and Friday's close sits far
 * from Monday's open for no reason a reader cares about. Worse, the flat segment
 * reads as data — a price that held steady — when nothing was observed.
 *
 * {@link sessionTimeScale} collapses those intervals. It is a piecewise-linear
 * map from timestamps to pixels where excluded intervals have zero width, so
 * only observed time gets any. Every session is then drawn at the same scale as
 * every other, which is what makes two trading days visually comparable.
 *
 * The intervals are not a market calendar. {@link detectClosedPeriods} infers
 * them from the sample spacing the data already has, so the same code handles a
 * 24/7 crypto pair (no gaps, so no collapsing), an equity with nights and
 * weekends, and a holiday nobody hardcoded.
 *
 * The collapse is deliberately *visible*: {@link SessionTimeScale.breaks}
 * reports where time was removed so the chart can mark it. A compressed axis
 * that hides its own compression would misrepresent elapsed time.
 */

/** A half-open interval `[from, to)` of time carrying no observations. */
export interface ClosedPeriod {
  from: number;
  to: number;
}

/**
 * How much larger than the typical sample spacing a gap must be before it
 * counts as a closure rather than a late sample. Four is loose enough that
 * ordinary jitter and a skipped tick never register, and tight enough to catch
 * an overnight break in hourly data.
 */
const DEFAULT_GAP_FACTOR = 4;

/** Ascending, de-duplicated copy — the form every step below assumes. */
function sortedUnique(values: readonly number[]): number[] {
  return [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);
}

/** Middle value of an already-sorted list. */
function median(sorted: readonly number[]): number {
  if (sorted.length === 0) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * The intervals in `timestamps` that look like closures: gaps at least
 * `factor` times the median sample spacing.
 *
 * Uses the median rather than the mean because the outliers being looked for
 * would otherwise drag the threshold up past themselves — with a mean, a series
 * that is mostly closed would decide it is never closed. Needs at least three
 * samples to have a spacing to compare against; below that it reports nothing,
 * which leaves the axis linear.
 */
export function detectClosedPeriods(
  timestamps: readonly number[],
  options?: { factor?: number }
): ClosedPeriod[] {
  const sorted = sortedUnique(timestamps);
  if (sorted.length < 3) {
    return [];
  }
  const gaps: number[] = [];
  for (let index = 1; index < sorted.length; index++) {
    gaps.push(sorted[index] - sorted[index - 1]);
  }
  const typical = median([...gaps].sort((a, b) => a - b));
  if (typical <= 0) {
    return [];
  }
  const threshold = typical * (options?.factor ?? DEFAULT_GAP_FACTOR);
  const closed: ClosedPeriod[] = [];
  for (let index = 1; index < sorted.length; index++) {
    const from = sorted[index - 1];
    const to = sorted[index];
    if (to - from > threshold) {
      // Leave one typical spacing of open time on the observed side of the
      // break so the last sample before it is not painted on the seam.
      closed.push({ from: from + typical, to });
    }
  }
  return closed;
}

/**
 * The shape {@link withClosedPeriodGaps} needs: when a sample was taken, which
 * series it belongs to, and a value that is allowed to be absent.
 */
export interface SessionSample {
  series: string;
  /** Epoch milliseconds. */
  t: number;
  /** `null` marks unobserved time, which line and area marks render as a gap. */
  v: number | null;
}

/**
 * Inserts a null-valued sample inside every closure a series spans, so the mark
 * breaks there instead of drawing through it.
 *
 * Collapsing a closure narrows it but does not make it honest on its own: a
 * curve still runs from the last observation to the next, and a reader has no
 * way to tell that segment from real data. The interpolation is the lie, not the
 * width. Breaking the path is what removes it — a line that stops and restarts
 * says "not observed" in a way no amount of axis compression can.
 *
 * Rows come back grouped by series and ascending in time, which is the order
 * line and area marks read them in.
 */
export function withClosedPeriodGaps<TRow extends SessionSample>(
  rows: readonly TRow[],
  closed: readonly ClosedPeriod[]
): TRow[] {
  if (closed.length === 0 || rows.length === 0) {
    return [...rows];
  }
  const bySeries = new Map<string, TRow[]>();
  for (const row of rows) {
    const existing = bySeries.get(row.series);
    if (existing) {
      existing.push(row);
    } else {
      bySeries.set(row.series, [row]);
    }
  }
  const output: TRow[] = [];
  for (const series of bySeries.values()) {
    const ordered = [...series].sort((a, b) => a.t - b.t);
    for (const period of closed) {
      // Only break a series that actually straddles this closure. A series
      // whose coverage starts after it has no gap to show.
      const spans =
        ordered.some((row) => row.t <= period.from) &&
        ordered.some((row) => row.t >= period.to);
      if (spans) {
        ordered.push({
          ...ordered[0],
          t: (period.from + period.to) / 2,
          v: null,
        });
      }
    }
    ordered.sort((a, b) => a.t - b.t);
    output.push(...ordered);
  }
  return output;
}

/** Clips to `domain`, drops empties, merges overlaps, and sorts ascending. */
function normalizePeriods(
  periods: readonly ClosedPeriod[],
  domain: readonly [number, number]
): ClosedPeriod[] {
  const [start, end] = domain;
  const clipped = periods
    .map((period) => ({
      from: Math.max(period.from, start),
      to: Math.min(period.to, end),
    }))
    .filter((period) => period.to > period.from)
    .sort((a, b) => a.from - b.from);
  const merged: ClosedPeriod[] = [];
  for (const period of clipped) {
    const last = merged.at(-1);
    if (last && period.from <= last.to) {
      last.to = Math.max(last.to, period.to);
    } else {
      merged.push({ ...period });
    }
  }
  return merged;
}

/**
 * A continuous time scale over epoch milliseconds, shaped for
 * `ChartAxisOptions.scale`.
 *
 * Deliberately exposes no `bandwidth`: that is how the chart runtime tells a
 * continuous scale from a categorical one, and a scale reporting a bandwidth is
 * both offset by half of it and refused by the axis viewport.
 */
export interface SessionTimeScale {
  /**
   * Timestamps where time was removed, in ascending order. Empty when the scale
   * is plain linear — nothing was collapsed, so there is nothing to mark.
   */
  breaks(): number[];
  copy(): SessionTimeScale;
  domain(): readonly [number, number];
  domain(values: Iterable<number>): SessionTimeScale;
  invert(position: number): number;
  range(): readonly [number, number];
  range(values: Iterable<number>): SessionTimeScale;
  tickFormat(count?: number): (value: number) => string;
  ticks(count?: number): number[];
  (value: number | null | undefined): number | undefined;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Tick spacings that read as time rather than as arithmetic. Ticks land on
 * multiples of these, so labels fall on clock and calendar boundaries instead
 * of at even divisions of an arbitrary window.
 */
const TICK_STEPS = [
  MINUTE,
  5 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  7 * DAY,
  28 * DAY,
  91 * DAY,
  365 * DAY,
] as const;

/** The smallest ladder step that yields at most `count` ticks over `span`. */
function tickStep(span: number, count: number): number {
  const target = span / Math.max(1, count);
  return TICK_STEPS.find((step) => step >= target) ?? TICK_STEPS.at(-1) ?? DAY;
}

/**
 * A time scale whose `closed` intervals occupy no width.
 *
 * Pass the intervals to remove — {@link detectClosedPeriods} derives them from
 * the data. With none, the result is an ordinary linear time scale, so callers
 * never need to branch on whether the data has gaps.
 */
export function sessionTimeScale(
  domain: readonly [number, number],
  closed: readonly ClosedPeriod[] = []
): SessionTimeScale {
  let currentDomain: [number, number] = [domain[0], domain[1]];
  let currentRange: [number, number] = [0, 1];
  let periods = normalizePeriods(closed, currentDomain);

  /**
   * Elapsed *open* time from the domain start to `value`. Time inside a closed
   * period contributes nothing, which is what collapses it: every timestamp in
   * one interval shares a single position.
   */
  const openElapsed = (value: number): number => {
    const clamped = Math.min(
      Math.max(value, currentDomain[0]),
      currentDomain[1]
    );
    let open = clamped - currentDomain[0];
    for (const period of periods) {
      if (period.from >= clamped) {
        break;
      }
      open -= Math.min(clamped, period.to) - period.from;
    }
    return Math.max(0, open);
  };

  /** Total open time in the domain — the denominator for every position. */
  const openSpan = (): number => {
    const total = openElapsed(currentDomain[1]);
    return total > 0 ? total : 1;
  };

  /** The timestamp sitting `open` milliseconds of open time into the domain. */
  const timeAtOpenElapsed = (open: number): number => {
    let remaining = Math.max(0, open);
    let cursor = currentDomain[0];
    for (const period of periods) {
      const openBefore = period.from - cursor;
      if (remaining < openBefore) {
        return cursor + remaining;
      }
      remaining -= openBefore;
      cursor = period.to;
    }
    return Math.min(cursor + remaining, currentDomain[1]);
  };

  const scale = ((value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }
    const fraction = openElapsed(value) / openSpan();
    return currentRange[0] + fraction * (currentRange[1] - currentRange[0]);
  }) as SessionTimeScale;

  scale.domain = ((values?: Iterable<number>) => {
    if (values === undefined) {
      return currentDomain;
    }
    const next = [...values];
    currentDomain = [next[0], next.at(-1) ?? next[0]];
    periods = normalizePeriods(closed, currentDomain);
    return scale;
    // The overloads above are the public contract; the runtime is one function.
  }) as SessionTimeScale["domain"];

  scale.range = ((values?: Iterable<number>) => {
    if (values === undefined) {
      return currentRange;
    }
    const next = [...values];
    currentRange = [next[0], next.at(-1) ?? next[0]];
    return scale;
  }) as SessionTimeScale["range"];

  scale.invert = (position: number): number => {
    const width = currentRange[1] - currentRange[0];
    const fraction = width === 0 ? 0 : (position - currentRange[0]) / width;
    return timeAtOpenElapsed(fraction * openSpan());
  };

  /**
   * Ticks aligned to a time boundary, emitted per open segment so none lands
   * inside a collapsed interval where several timestamps share one position.
   */
  scale.ticks = (count = 6): number[] => {
    const step = tickStep(openSpan(), count);
    const ticks: number[] = [];
    let cursor = currentDomain[0];
    for (const period of [
      ...periods,
      { from: currentDomain[1], to: currentDomain[1] },
    ]) {
      const first = Math.ceil(cursor / step) * step;
      for (let tick = first; tick < period.from; tick += step) {
        ticks.push(tick);
      }
      cursor = period.to;
    }
    return ticks;
  };

  scale.tickFormat = () => (value: number) => new Date(value).toISOString();

  scale.copy = () => {
    const next = sessionTimeScale(currentDomain, closed);
    next.range(currentRange);
    return next;
  };

  scale.breaks = () => periods.map((period) => period.from);

  return scale;
}
