import { describe, expect, it } from "vitest";

import {
  clampSidebarWidthRem,
  dampSidebarOvershootRem,
  PAGE_SIDEBAR_COLLAPSE_OVERSHOOT_RATIO,
  PAGE_SIDEBAR_COLLAPSED_GUTTER_REM,
  PAGE_SIDEBAR_DEFAULT_WIDTH_REM,
  PAGE_SIDEBAR_MAX_WIDTH_REM,
  PAGE_SIDEBAR_MIN_WIDTH_REM,
  PAGE_SIDEBAR_RUBBER_BAND_MAX_REM,
  PAGE_SIDEBAR_RUBBER_BAND_RESISTANCE_REM,
  resolveSidebarPointerResize,
  sidebarCollapseOvershootThresholdPx,
  sidebarMaxWidthPx,
  sidebarMinWidthPx,
  sidebarPanelMaxSizeCss,
  sidebarPanelMinSizeCss,
} from "@/lib/pages/page-sidebar-layout-cookie.ts";

describe("clampSidebarWidthRem", () => {
  it("uses shadcn default when value is missing", () => {
    expect(PAGE_SIDEBAR_DEFAULT_WIDTH_REM).toBe(PAGE_SIDEBAR_MIN_WIDTH_REM);
    expect(PAGE_SIDEBAR_DEFAULT_WIDTH_REM).toBe(12);
  });

  it("clamps below min and above max", () => {
    expect(clampSidebarWidthRem(8)).toBe(PAGE_SIDEBAR_MIN_WIDTH_REM);
    expect(clampSidebarWidthRem(30)).toBe(PAGE_SIDEBAR_MAX_WIDTH_REM);
    expect(clampSidebarWidthRem(16)).toBe(16);
  });
});

describe("dampSidebarOvershootRem", () => {
  it("returns zero for non-positive overshoot", () => {
    expect(dampSidebarOvershootRem(0)).toBe(0);
    expect(dampSidebarOvershootRem(-1)).toBe(0);
  });

  it("applies increasing friction below the hard max", () => {
    const small = dampSidebarOvershootRem(0.5);
    const large = dampSidebarOvershootRem(2);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(2);
    expect(large).toBeLessThan(PAGE_SIDEBAR_RUBBER_BAND_MAX_REM);
  });

  it("hard-caps travel at the rubber-band max", () => {
    expect(dampSidebarOvershootRem(100)).toBe(PAGE_SIDEBAR_RUBBER_BAND_MAX_REM);
  });

  it("uses the configured resistance constant", () => {
    expect(PAGE_SIDEBAR_RUBBER_BAND_RESISTANCE_REM).toBe(3);
    const expected =
      PAGE_SIDEBAR_RUBBER_BAND_RESISTANCE_REM *
      (1 - 1 / (1 + 1.5 / PAGE_SIDEBAR_RUBBER_BAND_RESISTANCE_REM));
    expect(dampSidebarOvershootRem(1.5)).toBeCloseTo(expected, 6);
  });
});

describe("resolveSidebarPointerResize", () => {
  const rootFontSizePx = 16;
  const minPx = sidebarMinWidthPx(rootFontSizePx);
  const maxPx = sidebarMaxWidthPx(rootFontSizePx);
  const collapseThresholdPx =
    sidebarCollapseOvershootThresholdPx(rootFontSizePx);

  it("uses full min width as collapse overshoot threshold (left screen edge)", () => {
    expect(PAGE_SIDEBAR_COLLAPSE_OVERSHOOT_RATIO).toBe(1);
    expect(collapseThresholdPx).toBe(minPx);
    expect(collapseThresholdPx).toBe(192);
  });

  it("tracks the pointer directly inside the logical range", () => {
    expect(resolveSidebarPointerResize(200, rootFontSizePx)).toEqual({
      widthRem: 12.5,
      visualWidthRem: 12.5,
      overshootPx: 0,
    });
    expect(resolveSidebarPointerResize(minPx, rootFontSizePx)).toEqual({
      widthRem: PAGE_SIDEBAR_MIN_WIDTH_REM,
      visualWidthRem: PAGE_SIDEBAR_MIN_WIDTH_REM,
      overshootPx: 0,
    });
    expect(resolveSidebarPointerResize(maxPx, rootFontSizePx)).toEqual({
      widthRem: PAGE_SIDEBAR_MAX_WIDTH_REM,
      visualWidthRem: PAGE_SIDEBAR_MAX_WIDTH_REM,
      overshootPx: 0,
    });
  });

  it("rubber-bands past min while reporting undamped overshoot for collapse", () => {
    const overshootPx = 40;
    const result = resolveSidebarPointerResize(
      minPx - overshootPx,
      rootFontSizePx
    );
    const expectedDamped = dampSidebarOvershootRem(
      overshootPx / rootFontSizePx
    );

    expect(result.widthRem).toBe(PAGE_SIDEBAR_MIN_WIDTH_REM);
    expect(result.overshootPx).toBe(overshootPx);
    expect(result.visualWidthRem).toBeCloseTo(
      PAGE_SIDEBAR_MIN_WIDTH_REM - expectedDamped,
      6
    );
    expect(result.visualWidthRem).toBeLessThan(PAGE_SIDEBAR_MIN_WIDTH_REM);
    expect(result.visualWidthRem).toBeGreaterThanOrEqual(
      PAGE_SIDEBAR_MIN_WIDTH_REM - PAGE_SIDEBAR_RUBBER_BAND_MAX_REM
    );
  });

  it("rubber-bands past max without reporting min-side overshoot", () => {
    const overshootPx = 48;
    const result = resolveSidebarPointerResize(
      maxPx + overshootPx,
      rootFontSizePx
    );
    const expectedDamped = dampSidebarOvershootRem(
      overshootPx / rootFontSizePx
    );

    expect(result.widthRem).toBe(PAGE_SIDEBAR_MAX_WIDTH_REM);
    expect(result.overshootPx).toBe(0);
    expect(result.visualWidthRem).toBeCloseTo(
      PAGE_SIDEBAR_MAX_WIDTH_REM + expectedDamped,
      6
    );
    expect(result.visualWidthRem).toBeGreaterThan(PAGE_SIDEBAR_MAX_WIDTH_REM);
    expect(result.visualWidthRem).toBeLessThanOrEqual(
      PAGE_SIDEBAR_MAX_WIDTH_REM + PAGE_SIDEBAR_RUBBER_BAND_MAX_REM
    );
  });

  it("bounds visual travel at both limits under extreme overshoot", () => {
    const below = resolveSidebarPointerResize(minPx - 1000, rootFontSizePx);
    const above = resolveSidebarPointerResize(maxPx + 1000, rootFontSizePx);

    expect(below.visualWidthRem).toBe(
      PAGE_SIDEBAR_MIN_WIDTH_REM - PAGE_SIDEBAR_RUBBER_BAND_MAX_REM
    );
    expect(above.visualWidthRem).toBe(
      PAGE_SIDEBAR_MAX_WIDTH_REM + PAGE_SIDEBAR_RUBBER_BAND_MAX_REM
    );
    expect(sidebarPanelMinSizeCss()).toBe("0rem");
    expect(PAGE_SIDEBAR_COLLAPSED_GUTTER_REM).toBe(0.5);
    expect(sidebarPanelMaxSizeCss()).toBe(
      `${PAGE_SIDEBAR_MAX_WIDTH_REM + PAGE_SIDEBAR_RUBBER_BAND_MAX_REM}rem`
    );
  });

  it("reaches full collapse threshold only at the left screen edge", () => {
    // Mid rubber-band overshoot stays below collapse — spring-back path.
    expect(
      resolveSidebarPointerResize(minPx - 96, rootFontSizePx).overshootPx
    ).toBeLessThan(collapseThresholdPx);

    expect(
      resolveSidebarPointerResize(minPx - collapseThresholdPx, rootFontSizePx)
    ).toMatchObject({
      widthRem: PAGE_SIDEBAR_MIN_WIDTH_REM,
      overshootPx: collapseThresholdPx,
    });
    expect(
      resolveSidebarPointerResize(
        minPx - collapseThresholdPx - 1,
        rootFontSizePx
      ).overshootPx
    ).toBeGreaterThan(collapseThresholdPx);
  });
});
