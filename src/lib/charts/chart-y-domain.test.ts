import { describe, expect, it } from "vitest";
import {
  isZeroBasedAggregate,
  resolveAutoYDomain,
} from "@/lib/charts/chart-y-domain.ts";

describe("isZeroBasedAggregate", () => {
  it("treats count and sum as zero-based magnitudes", () => {
    expect(isZeroBasedAggregate("count")).toBe(true);
    expect(isZeroBasedAggregate("sum")).toBe(true);
  });

  it("treats level aggregates as not zero-based", () => {
    expect(isZeroBasedAggregate("average")).toBe(false);
    expect(isZeroBasedAggregate("min")).toBe(false);
    expect(isZeroBasedAggregate("max")).toBe(false);
  });
});

describe("resolveAutoYDomain", () => {
  it("anchors zero-based data at 0 with headroom above the peak", () => {
    const { min, max } = resolveAutoYDomain({
      values: [2, 2, 2],
      zeroBased: true,
    });
    expect(min).toBe(0);
    expect(max).toBeGreaterThan(2);
  });

  it("zooms a narrow high band instead of squashing it against 0", () => {
    const { min, max } = resolveAutoYDomain({
      values: [821, 856, 840],
      zeroBased: false,
    });
    // Floor lifts well off 0 so the variation is readable.
    expect(min).toBeGreaterThan(700);
    expect(min).toBeLessThanOrEqual(821);
    expect(max).toBeGreaterThanOrEqual(856);
  });

  it("honours an explicit yMin/yMax exactly", () => {
    const { min, max } = resolveAutoYDomain({
      values: [821, 856, 840],
      zeroBased: false,
      yMax: 900,
      yMin: 800,
    });
    expect(min).toBe(800);
    expect(max).toBe(900);
  });

  it("still auto-fits the side left unset", () => {
    const { min, max } = resolveAutoYDomain({
      values: [821, 856, 840],
      yMin: 810,
      zeroBased: false,
    });
    expect(min).toBe(810);
    expect(max).toBeGreaterThanOrEqual(856);
  });

  it("opens a band for all-equal data so the mark stays visible", () => {
    const { min, max } = resolveAutoYDomain({
      values: [840, 840, 840],
      zeroBased: false,
    });
    expect(max).toBeGreaterThan(min);
  });

  it("handles negative values (e.g. percent change) without forcing 0", () => {
    const { min, max } = resolveAutoYDomain({
      values: [-3.2, 1.4, -0.5],
      zeroBased: false,
    });
    expect(min).toBeLessThanOrEqual(-3.2);
    expect(max).toBeGreaterThanOrEqual(1.4);
  });

  it("ignores non-finite values", () => {
    const { min, max } = resolveAutoYDomain({
      values: [Number.NaN, 10, Number.POSITIVE_INFINITY, 20],
      zeroBased: true,
    });
    expect(min).toBe(0);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThanOrEqual(20);
  });
});
