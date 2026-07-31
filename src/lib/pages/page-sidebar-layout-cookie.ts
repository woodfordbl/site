import {
  readDocumentCookie,
  writeDocumentCookie,
} from "@/lib/cookies/document-cookie.ts";

/** Cookie for desktop sidebar width in `rem` (`site-page-sidebar-width`). */
export const PAGE_SIDEBAR_WIDTH_COOKIE_NAME = "site-page-sidebar-width";

export const PAGE_SIDEBAR_PANEL_ID = "page-sidebar";
export const PAGE_MAIN_PANEL_ID = "page-main";

/** Matches shadcn `SIDEBAR_WIDTH` (`12rem`). */
export const PAGE_SIDEBAR_DEFAULT_WIDTH_REM = 12;

/** Minimum draggable width (shadcn default). */
export const PAGE_SIDEBAR_MIN_WIDTH_REM = 12;

/** Maximum draggable width. */
export const PAGE_SIDEBAR_MAX_WIDTH_REM = 24;

/**
 * Past minimum width, drag this fraction of the min width further to collapse.
 * `1` means the pointer must reach the left screen edge (clientX ≤ 0) — so
 * rubber-band spring-back still wins for normal overshoot at the min stop.
 * (e.g. min 192px → 192px overshoot / pointer at x=0 triggers full collapse).
 */
export const PAGE_SIDEBAR_COLLAPSE_OVERSHOOT_RATIO = 1;

/**
 * Max visual travel past a logical limit during rubber-band resize (rem).
 * Panel min/max are expanded by this so `panel.resize()` can overshoot.
 */
export const PAGE_SIDEBAR_RUBBER_BAND_MAX_REM = 2;

/**
 * Resistance for increasing-friction overshoot. Higher = stiffer band.
 * Damped travel asymptotes toward this before the hard max cap.
 */
export const PAGE_SIDEBAR_RUBBER_BAND_RESISTANCE_REM = 3;

/** Collapsed rail width — matches shadcn `SIDEBAR_WIDTH_ICON` (`3rem`). */
export const PAGE_SIDEBAR_COLLAPSED_SIZE = "3rem";

/** Desktop inset retained between the viewport edge and collapsed main panel. */
export const PAGE_SIDEBAR_COLLAPSED_GUTTER_REM = 0.5;

export function clampSidebarWidthRem(rem: number): number {
  return Math.min(
    PAGE_SIDEBAR_MAX_WIDTH_REM,
    Math.max(PAGE_SIDEBAR_MIN_WIDTH_REM, rem)
  );
}

/** Logical width as a CSS size (clamped to the saved 12–24rem range). */
export function sidebarWidthRemToCss(rem: number): string {
  return `${clampSidebarWidthRem(rem)}rem`;
}

/** Visual panel width as CSS — may exceed the logical range during rubber-band. */
export function sidebarVisualWidthRemToCss(rem: number): string {
  return `${rem}rem`;
}

/**
 * Panel hard minimum. Pointer resizing remains bounded by
 * {@link resolveSidebarPointerResize}; zero is reserved for animated collapse.
 */
export function sidebarPanelMinSizeCss(): string {
  return "0rem";
}

/** Panel `maxSize` allowing rubber-band travel above the logical maximum. */
export function sidebarPanelMaxSizeCss(): string {
  return `${PAGE_SIDEBAR_MAX_WIDTH_REM + PAGE_SIDEBAR_RUBBER_BAND_MAX_REM}rem`;
}

/**
 * Maps raw pointer overshoot past a limit into a damped visual offset.
 * Travel grows with decreasing returns and is hard-capped at
 * {@link PAGE_SIDEBAR_RUBBER_BAND_MAX_REM}.
 */
export function dampSidebarOvershootRem(
  overshootRem: number,
  resistanceRem = PAGE_SIDEBAR_RUBBER_BAND_RESISTANCE_REM,
  maxRem = PAGE_SIDEBAR_RUBBER_BAND_MAX_REM
): number {
  if (overshootRem <= 0 || resistanceRem <= 0 || maxRem <= 0) {
    return 0;
  }

  const damped = resistanceRem * (1 - 1 / (1 + overshootRem / resistanceRem));
  return Math.min(damped, maxRem);
}

export function readRootFontSizePx(): number {
  if (typeof document === "undefined") {
    return 16;
  }

  return (
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  );
}

export function pixelsToRem(pixels: number): number {
  if (typeof document === "undefined") {
    return PAGE_SIDEBAR_DEFAULT_WIDTH_REM;
  }

  return pixels / readRootFontSizePx();
}

export function sidebarMinWidthPx(
  rootFontSizePx = readRootFontSizePx()
): number {
  return PAGE_SIDEBAR_MIN_WIDTH_REM * rootFontSizePx;
}

export function sidebarMaxWidthPx(
  rootFontSizePx = readRootFontSizePx()
): number {
  return PAGE_SIDEBAR_MAX_WIDTH_REM * rootFontSizePx;
}

export function sidebarCollapseOvershootThresholdPx(
  rootFontSizePx = readRootFontSizePx()
): number {
  return (
    sidebarMinWidthPx(rootFontSizePx) * PAGE_SIDEBAR_COLLAPSE_OVERSHOOT_RATIO
  );
}

export interface SidebarPointerResizeResult {
  /**
   * Undamped pixels past the minimum (for collapse threshold). Zero when the
   * pointer is at or above the logical minimum — max-side overshoot is not
   * reported here.
   */
  overshootPx: number;
  /**
   * Visual panel width in rem, including rubber-band past the logical limits.
   * Never used for persistence.
   */
  visualWidthRem: number;
  /** Clamped logical width (12–24rem) for state and cookie persistence. */
  widthRem: number;
}

/**
 * Maps a viewport `clientX` to sidebar width with rubber-band past min/max.
 * In range, visual and logical widths match the pointer. Past either limit,
 * visual width travels a damped distance while `widthRem` stays clamped.
 * `overshootPx` tracks undamped travel past min for the collapse gesture.
 */
export function resolveSidebarPointerResize(
  clientX: number,
  rootFontSizePx: number
): SidebarPointerResizeResult {
  const minPx = sidebarMinWidthPx(rootFontSizePx);
  const maxPx = sidebarMaxWidthPx(rootFontSizePx);

  if (clientX < minPx) {
    const overshootPx = minPx - clientX;
    const dampedRem = dampSidebarOvershootRem(overshootPx / rootFontSizePx);
    return {
      widthRem: PAGE_SIDEBAR_MIN_WIDTH_REM,
      visualWidthRem: PAGE_SIDEBAR_MIN_WIDTH_REM - dampedRem,
      overshootPx,
    };
  }

  if (clientX > maxPx) {
    const overshootPx = clientX - maxPx;
    const dampedRem = dampSidebarOvershootRem(overshootPx / rootFontSizePx);
    return {
      widthRem: PAGE_SIDEBAR_MAX_WIDTH_REM,
      visualWidthRem: PAGE_SIDEBAR_MAX_WIDTH_REM + dampedRem,
      overshootPx: 0,
    };
  }

  const widthRem = clientX / rootFontSizePx;
  return {
    widthRem,
    visualWidthRem: widthRem,
    overshootPx: 0,
  };
}

/** Parses raw width cookie value in `rem` (defaults to shadcn `12rem`). */
export function parsePageSidebarWidthCookie(value: string | undefined): number {
  if (!value) {
    return PAGE_SIDEBAR_DEFAULT_WIDTH_REM;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return PAGE_SIDEBAR_DEFAULT_WIDTH_REM;
  }

  return clampSidebarWidthRem(parsed);
}

/** Reads saved sidebar width in `rem` (defaults to shadcn `12rem`). */
export function readPageSidebarWidthFromDocument(): number {
  return parsePageSidebarWidthCookie(
    readDocumentCookie(PAGE_SIDEBAR_WIDTH_COOKIE_NAME)
  );
}

/** Persists sidebar width in `rem`. */
export function writePageSidebarWidthToDocument(rem: number): void {
  writeDocumentCookie(
    PAGE_SIDEBAR_WIDTH_COOKIE_NAME,
    String(clampSidebarWidthRem(rem))
  );
}
