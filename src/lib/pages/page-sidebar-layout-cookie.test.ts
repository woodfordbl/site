import { describe, expect, it } from "vitest";

import {
  clampSidebarWidthRem,
  PAGE_SIDEBAR_COLLAPSE_OVERSHOOT_RATIO,
  PAGE_SIDEBAR_DEFAULT_WIDTH_REM,
  PAGE_SIDEBAR_MAX_WIDTH_REM,
  PAGE_SIDEBAR_MIN_WIDTH_REM,
  resolveSidebarPointerResize,
  sidebarCollapseOvershootThresholdPx,
  sidebarMinWidthPx,
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

describe("resolveSidebarPointerResize", () => {
  const rootFontSizePx = 16;
  const minPx = sidebarMinWidthPx(rootFontSizePx);
  const collapseThresholdPx =
    sidebarCollapseOvershootThresholdPx(rootFontSizePx);

  it("uses 50% of min width as collapse overshoot threshold", () => {
    expect(PAGE_SIDEBAR_COLLAPSE_OVERSHOOT_RATIO).toBe(0.5);
    expect(collapseThresholdPx).toBe(minPx * 0.5);
    expect(collapseThresholdPx).toBe(96);
  });

  it("resizes normally at or above min width", () => {
    expect(resolveSidebarPointerResize(200, rootFontSizePx)).toEqual({
      widthRem: 12.5,
      overshootPx: 0,
    });
    expect(resolveSidebarPointerResize(minPx, rootFontSizePx)).toEqual({
      widthRem: PAGE_SIDEBAR_MIN_WIDTH_REM,
      overshootPx: 0,
    });
  });

  it("clamps visual width at min while tracking overshoot below min", () => {
    expect(resolveSidebarPointerResize(minPx - 40, rootFontSizePx)).toEqual({
      widthRem: PAGE_SIDEBAR_MIN_WIDTH_REM,
      overshootPx: 40,
    });
  });

  it("reaches full collapse threshold at half min width past min", () => {
    expect(
      resolveSidebarPointerResize(minPx - collapseThresholdPx, rootFontSizePx)
    ).toEqual({
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
