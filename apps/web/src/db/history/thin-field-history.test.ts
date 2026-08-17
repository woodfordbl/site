import { describe, expect, it } from "vitest";

import {
  type FieldHistoryPoint,
  MAX_POINTS_PER_SERIES,
} from "@/db/history/field-history-types.ts";
import { thinFieldHistory } from "@/db/history/thin-field-history.ts";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const NOW = Date.parse("2026-06-01T00:00:00.000Z");

/** Points every `stepMs` across `[NOW - spanMs, NOW]`, ascending. */
function densePoints(spanMs: number, stepMs: number): FieldHistoryPoint[] {
  const points: FieldHistoryPoint[] = [];
  for (let t = NOW - spanMs; t <= NOW; t += stepMs) {
    points.push({ t, v: t });
  }
  return points;
}

describe("thinFieldHistory", () => {
  it("returns short series unchanged", () => {
    const points = [{ t: NOW - 1000, v: 1 }];
    expect(thinFieldHistory(points, NOW)).toEqual(points);
  });

  it("collapses sub-bucket recent points to the newest per 15s bucket", () => {
    // 5 minutes of 1/sec points → ~20 fifteen-second buckets.
    const thinned = thinFieldHistory(densePoints(5 * MINUTE_MS, 1000), NOW);
    expect(thinned.length).toBeLessThanOrEqual(22);
    expect(thinned.length).toBeGreaterThanOrEqual(19);
  });

  it("coarsens old history to daily buckets", () => {
    // ~8h of 1/min points, but 40 days old → all in day-wide archive buckets.
    const old: FieldHistoryPoint[] = [];
    const base = NOW - 40 * DAY_MS;
    for (let i = 0; i < 480; i++) {
      old.push({ t: base + i * MINUTE_MS, v: i });
    }
    expect(thinFieldHistory(old, NOW).length).toBeLessThanOrEqual(2);
  });

  it("always keeps the single most-recent point", () => {
    const points = densePoints(2 * HOUR_MS, MINUTE_MS);
    const thinned = thinFieldHistory(points, NOW);
    expect(thinned.at(-1)).toEqual(points.at(-1));
  });

  it("stays ascending and within the hard cap", () => {
    // A year of 1/min points is far more than the cap.
    const points = densePoints(365 * DAY_MS, MINUTE_MS);
    const thinned = thinFieldHistory(points, NOW);
    expect(thinned.length).toBeLessThanOrEqual(MAX_POINTS_PER_SERIES);
    for (let i = 1; i < thinned.length; i++) {
      expect(thinned[i].t).toBeGreaterThanOrEqual(thinned[i - 1].t);
    }
  });
});
