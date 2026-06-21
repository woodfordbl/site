import { describe, expect, it } from "vitest";

import {
  clampSidebarWidthRem,
  PAGE_SIDEBAR_DEFAULT_WIDTH_REM,
  PAGE_SIDEBAR_MAX_WIDTH_REM,
  PAGE_SIDEBAR_MIN_WIDTH_REM,
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
