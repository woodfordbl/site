import { createChartScene, defineChart, lineY } from "@tanstack/charts";
import { describe, expect, it } from "vitest";

import { numberValueAxis } from "@/lib/charts/chart-spec.ts";
import {
  detectClosedPeriods,
  sessionTimeScale,
  withClosedPeriodGaps,
} from "@/lib/charts/session-time-scale.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Friday 09:00 UTC — the anchor for the weekday/weekend fixtures. */
const FRIDAY = Date.UTC(2026, 5, 5, 9);

/** Hourly samples across a Friday and the following Monday, weekend absent. */
function weekdaySamples(): number[] {
  const friday = Array.from({ length: 8 }, (_unused, i) => FRIDAY + i * HOUR);
  const monday = Array.from(
    { length: 8 },
    (_unused, i) => FRIDAY + 3 * DAY + i * HOUR
  );
  return [...friday, ...monday];
}

describe("detectClosedPeriods", () => {
  it("finds the weekend in hourly weekday samples", () => {
    const closed = detectClosedPeriods(weekdaySamples());
    expect(closed).toHaveLength(1);
    // The break opens one typical spacing after the last Friday sample and
    // closes on the first Monday one.
    const [period] = closed;
    expect(period.from).toBe(FRIDAY + 7 * HOUR + HOUR);
    expect(period.to).toBe(FRIDAY + 3 * DAY);
  });

  it("reports nothing for evenly-spaced samples", () => {
    const even = Array.from({ length: 20 }, (_unused, i) => FRIDAY + i * HOUR);
    expect(detectClosedPeriods(even)).toEqual([]);
  });

  it("is not fooled by a single late sample", () => {
    // One doubled interval is jitter, not a closure, at the default factor.
    const jittery = [0, HOUR, 2 * HOUR, 4 * HOUR, 5 * HOUR, 6 * HOUR];
    expect(detectClosedPeriods(jittery)).toEqual([]);
  });

  it("uses the median so a mostly-closed series still finds its breaks", () => {
    // Three dense clusters far apart: the mean gap would exceed most gaps, but
    // the median is the within-cluster spacing.
    const clustered = [0, 1, 2, 3, 1000, 1001, 1002, 1003, 2000, 2001, 2002];
    expect(detectClosedPeriods(clustered)).toHaveLength(2);
  });

  it("needs a spacing to compare against before deciding anything", () => {
    expect(detectClosedPeriods([])).toEqual([]);
    expect(detectClosedPeriods([FRIDAY])).toEqual([]);
    expect(detectClosedPeriods([FRIDAY, FRIDAY + DAY])).toEqual([]);
  });

  it("ignores non-finite timestamps", () => {
    expect(detectClosedPeriods([Number.NaN, Number.NaN])).toEqual([]);
  });
});

describe("sessionTimeScale", () => {
  const samples = weekdaySamples();
  const domain = [samples[0], samples.at(-1) ?? 0] as const;

  function scale() {
    return sessionTimeScale(domain, detectClosedPeriods(samples)).range([
      0, 100,
    ]);
  }

  it("maps the domain ends onto the range ends", () => {
    const positioned = scale();
    expect(positioned(domain[0])).toBe(0);
    expect(positioned(domain[1])).toBe(100);
  });

  it("spends no width on the closed period", () => {
    const positioned = scale();
    const lastFriday = FRIDAY + 7 * HOUR;
    const firstMonday = FRIDAY + 3 * DAY;
    // The two sessions are eight hourly samples each, so the seam sits at the
    // halfway point rather than two-sevenths of the way across a real week.
    expect(positioned(lastFriday)).toBeCloseTo(46.7, 1);
    expect(positioned(firstMonday)).toBeCloseTo(53.3, 1);
  });

  it("gives equal-length sessions equal width", () => {
    const positioned = scale();
    const fridayWidth =
      (positioned(FRIDAY + 7 * HOUR) ?? 0) - (positioned(FRIDAY) ?? 0);
    const mondayWidth =
      (positioned(domain[1]) ?? 0) - (positioned(FRIDAY + 3 * DAY) ?? 0);
    expect(fridayWidth).toBeCloseTo(mondayWidth, 6);
  });

  it("collapses every timestamp inside a closure onto one position", () => {
    const positioned = scale();
    const saturday = FRIDAY + 1.5 * DAY;
    const sunday = FRIDAY + 2.5 * DAY;
    expect(positioned(saturday)).toBe(positioned(sunday));
  });

  it("degrades to a plain linear scale when nothing is closed", () => {
    const linear = sessionTimeScale([0, 100], []).range([0, 100]);
    expect(linear(50)).toBeCloseTo(50, 6);
    expect(linear.breaks()).toEqual([]);
  });

  it("clamps outside the domain instead of extrapolating", () => {
    const positioned = scale();
    expect(positioned(domain[0] - DAY)).toBe(0);
    expect(positioned(domain[1] + DAY)).toBe(100);
  });

  it("returns undefined for a value that is not a finite number", () => {
    const positioned = scale();
    expect(positioned(null)).toBeUndefined();
    expect(positioned(undefined)).toBeUndefined();
    expect(positioned(Number.NaN)).toBeUndefined();
  });

  it("inverts a position back to the timestamp it came from", () => {
    const positioned = scale();
    for (const sample of samples) {
      const px = positioned(sample) ?? 0;
      expect(positioned.invert(px)).toBeCloseTo(sample, 3);
    }
  });

  it("reports where it removed time so a chart can mark the seam", () => {
    expect(scale().breaks()).toEqual([FRIDAY + 8 * HOUR]);
  });

  it("keeps ticks out of the collapsed interval", () => {
    const positioned = scale();
    const [closed] = detectClosedPeriods(samples);
    for (const tick of positioned.ticks(6)) {
      expect(tick < closed.from || tick >= closed.to).toBe(true);
    }
  });

  it("aligns ticks to a clock boundary", () => {
    const ticks = scale().ticks(6);
    expect(ticks.length).toBeGreaterThan(1);
    const step = ticks[1] - ticks[0];
    for (const tick of ticks) {
      expect(tick % step).toBe(0);
    }
  });

  it("copies to an independent scale", () => {
    const original = scale();
    const clone = original.copy();
    clone.range([0, 200]);
    expect(original.range()).toEqual([0, 100]);
    expect(clone(domain[1])).toBe(200);
  });
});

describe("sessionTimeScale in a chart", () => {
  it("positions marks through the runtime's configured-scale path", () => {
    const samples = weekdaySamples();
    const rows = samples.map((t, index) => ({ t, v: index }));
    const definition = defineChart({
      marks: [lineY(rows, { x: "t", y: "v" })],
      x: {
        scale: sessionTimeScale(
          [samples[0], samples.at(-1) ?? 0],
          detectClosedPeriods(samples)
        ),
      },
      y: numberValueAxis({}),
    });
    const scene = createChartScene(definition, { width: 400, height: 200 });
    const xs = scene.points.map((point) => point.x);
    // Every sample lands somewhere finite and in ascending order.
    expect(xs).toHaveLength(rows.length);
    expect(xs.every(Number.isFinite)).toBe(true);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    // The weekend carries no width, so the widest sample-to-sample step is the
    // same as the ordinary hourly step.
    const steps = xs.slice(1).map((x, index) => x - xs[index]);
    expect(Math.max(...steps)).toBeCloseTo(Math.min(...steps), 6);
  });
});

describe("withClosedPeriodGaps", () => {
  const samples = weekdaySamples();
  const closed = detectClosedPeriods(samples);
  const rows = samples.map((t, index) => ({
    label: "ACME",
    series: "acme",
    t,
    v: index as number | null,
  }));

  it("breaks a series that straddles a closure", () => {
    const gapped = withClosedPeriodGaps(rows, closed);
    const gaps = gapped.filter((row) => row.v === null);
    expect(gaps).toHaveLength(1);
    // The break sits inside the closure, not on an observation.
    expect(gaps[0].t).toBeGreaterThan(closed[0].from);
    expect(gaps[0].t).toBeLessThan(closed[0].to);
  });

  it("keeps every observation and its extra fields", () => {
    const gapped = withClosedPeriodGaps(rows, closed);
    expect(gapped.filter((row) => row.v !== null)).toHaveLength(rows.length);
    expect(gapped.every((row) => row.label === "ACME")).toBe(true);
  });

  it("returns rows grouped by series and ascending in time", () => {
    const two = [
      ...rows,
      ...rows.map((row) => ({ ...row, label: "OTHER", series: "other" })),
    ];
    const gapped = withClosedPeriodGaps(two, closed);
    const acme = gapped.filter((row) => row.series === "acme");
    const other = gapped.filter((row) => row.series === "other");
    for (const group of [acme, other]) {
      const times = group.map((row) => row.t);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
    // Each series is contiguous, which is the order the marks read.
    expect(gapped.slice(0, acme.length).every((r) => r.series === "acme")).toBe(
      true
    );
  });

  it("leaves a series that does not straddle the closure alone", () => {
    // Only the Monday session: nothing to break across.
    const monday = rows.filter((row) => row.t >= closed[0].to);
    expect(withClosedPeriodGaps(monday, closed)).toHaveLength(monday.length);
  });

  it("is a copy when nothing is closed", () => {
    expect(withClosedPeriodGaps(rows, [])).toEqual(rows);
    expect(withClosedPeriodGaps([], closed)).toEqual([]);
  });
});

describe("closed-period gaps in a chart", () => {
  it("splits the line into one segment per session", () => {
    const samples = weekdaySamples();
    const closed = detectClosedPeriods(samples);
    const rows = withClosedPeriodGaps(
      samples.map((t, index) => ({
        series: "acme",
        t,
        v: index as number | null,
      })),
      closed
    );
    const definition = defineChart({
      marks: [lineY(rows, { x: "t", y: "v", z: "series" })],
      x: {
        scale: sessionTimeScale([samples[0], samples.at(-1) ?? 0], closed),
      },
      y: numberValueAxis({}),
    });
    const scene = createChartScene(definition, { width: 400, height: 200 });
    // The null row owns no chart point, so focus and the tooltip never see it.
    expect(scene.points).toHaveLength(samples.length);
    // Two sessions means two painted path segments.
    const paths = JSON.stringify(scene.nodes).match(/"kind":"polyline"/g) ?? [];
    expect(paths.length).toBe(2);
  });
});
