import { describe, expect, it } from "vitest";

import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import {
  clipToWindow,
  DEFAULT_TIME_WINDOW_MS,
  presetForWindow,
  resolutionForWindow,
  stitchBucketMs,
  stitchSeries,
} from "@/lib/databases/time-series-chart-data.ts";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

describe("presetForWindow / resolutionForWindow", () => {
  it("maps standard windows to their expected resolution", () => {
    expect(resolutionForWindow(DAY_MS)).toBe("5m");
    expect(resolutionForWindow(7 * DAY_MS)).toBe("1h");
    expect(resolutionForWindow(30 * DAY_MS)).toBe("4h");
    expect(resolutionForWindow(365 * DAY_MS)).toBe("1d");
  });

  it("snaps an odd window to the nearest preset", () => {
    expect(presetForWindow(6 * DAY_MS).id).toBe("7D");
    expect(presetForWindow(DEFAULT_TIME_WINDOW_MS).id).toBe("7D");
    expect(presetForWindow(15 * MINUTE_MS).id).toBe("LIVE");
  });
});

describe("stitchBucketMs", () => {
  it("buckets short live windows at the fine capture cadence, not the candle resolution", () => {
    // 15m window backfills at 1m candles, but live ticks must survive: bucket
    // collapses to the 15s local-capture cadence.
    expect(stitchBucketMs(15 * MINUTE_MS)).toBe(15_000);
    expect(stitchBucketMs(HOUR_MS)).toBe(15_000);
  });

  it("buckets long windows at their candle resolution", () => {
    expect(stitchBucketMs(DAY_MS)).toBe(5 * MINUTE_MS);
    expect(stitchBucketMs(7 * DAY_MS)).toBe(HOUR_MS);
  });
});

describe("stitchSeries", () => {
  const bucketMs = HOUR_MS;

  it("returns empty for two empty inputs", () => {
    expect(stitchSeries([], [], bucketMs)).toEqual([]);
  });

  it("lets finer local capture win the overlap with backfill", () => {
    const now = 100 * HOUR_MS;
    const backfill: FieldHistoryPoint[] = [];
    for (let i = 10; i >= 1; i--) {
      backfill.push({ t: now - i * HOUR_MS, v: 100 });
    }
    // Local starts 3h ago, finer, different value.
    const local: FieldHistoryPoint[] = [
      { t: now - 3 * HOUR_MS + MINUTE_MS, v: 200 },
      { t: now - MINUTE_MS, v: 201 },
    ];
    const stitched = stitchSeries(backfill, local, bucketMs);
    // No backfill (v=100) point should survive at/after the earliest local t.
    const earliestLocal = local[0].t;
    expect(
      stitched.filter((p) => p.t >= earliestLocal && p.v === 100)
    ).toHaveLength(0);
    // The newest point is local.
    expect(stitched.at(-1)?.v).toBe(201);
    // Ascending.
    for (let i = 1; i < stitched.length; i++) {
      expect(stitched[i].t).toBeGreaterThanOrEqual(stitched[i - 1].t);
    }
  });

  it("keeps backfill when there is no local capture", () => {
    const backfill = [
      { t: 1 * HOUR_MS, v: 10 },
      { t: 2 * HOUR_MS, v: 11 },
    ];
    expect(stitchSeries(backfill, [], bucketMs)).toEqual(backfill);
  });

  it("collapses multiple points in one bucket to the newest", () => {
    const local = [
      { t: 5 * HOUR_MS + 1000, v: 1 },
      { t: 5 * HOUR_MS + 2000, v: 2 },
      { t: 5 * HOUR_MS + 3000, v: 3 },
    ];
    const stitched = stitchSeries([], local, bucketMs);
    expect(stitched).toEqual([{ t: 5 * HOUR_MS + 3000, v: 3 }]);
  });
});

describe("clipToWindow", () => {
  it("keeps only points inside [from, to]", () => {
    const points = [
      { t: 10, v: 1 },
      { t: 20, v: 2 },
      { t: 30, v: 3 },
    ];
    expect(clipToWindow(points, 15, 30)).toEqual([
      { t: 20, v: 2 },
      { t: 30, v: 3 },
    ]);
  });
});
