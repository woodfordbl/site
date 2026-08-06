import { describe, expect, it } from "vitest";

import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import { computeSeriesCoverageGaps } from "@/lib/databases/ensure-series-coverage.ts";
import {
  latestSeriesValue,
  marketCapFromFloatAndPrice,
  pctChangeFromSeries,
  valueAtSeries,
} from "@/lib/databases/series-values.ts";

describe("computeSeriesCoverageGaps", () => {
  it("returns the full window when local is empty", () => {
    expect(computeSeriesCoverageGaps([], 1000, 5000, "5m")).toEqual([
      { from: 1000, to: 5000 },
    ]);
  });

  it("returns no gaps when a left anchor exists at or before from", () => {
    const points: FieldHistoryPoint[] = [
      { t: 900, v: 10 },
      { t: 3000, v: 12 },
    ];
    expect(computeSeriesCoverageGaps(points, 1000, 5000, "5m")).toEqual([]);
  });

  it("returns a left gap when local starts after from", () => {
    const hour = 3_600_000;
    const points: FieldHistoryPoint[] = [
      { t: 10 * hour, v: 10 },
      { t: 11 * hour, v: 11 },
    ];
    expect(
      computeSeriesCoverageGaps(points, hour, 12 * hour, "1h")
    ).toEqual([{ from: hour, to: 10 * hour }]);
  });
});

describe("series-values helpers", () => {
  const points: FieldHistoryPoint[] = [
    { t: 1000, v: 100 },
    { t: 2000, v: 110 },
    { t: 3000, v: 105 },
  ];

  it("reads latest and valueAt at-or-before", () => {
    expect(latestSeriesValue(points)).toBe(105);
    expect(valueAtSeries(points, 2000)).toBe(110);
    expect(valueAtSeries(points, 2500)).toBe(110);
    expect(valueAtSeries(points, 500)).toBeNull();
  });

  it("computes fractional pct change over a window", () => {
    // latest 105 vs value at 3000-2000=1000 → 100 → (105-100)/100 = 0.05
    expect(pctChangeFromSeries(points, 2000, 3000)).toBeCloseTo(0.05);
  });

  it("prefers an explicit latest override (live price cell)", () => {
    expect(pctChangeFromSeries(points, 2000, 3000, 120)).toBeCloseTo(0.2);
  });

  it("derives market cap from float × price", () => {
    expect(marketCapFromFloatAndPrice(1_000_000, 190.5)).toBe(190_500_000);
    expect(marketCapFromFloatAndPrice(null, 190.5)).toBeNull();
    expect(marketCapFromFloatAndPrice(0, 190.5)).toBeNull();
  });
});
