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

/** Collapsed rail width — matches shadcn `SIDEBAR_WIDTH_ICON` (`3rem`). */
export const PAGE_SIDEBAR_COLLAPSED_SIZE = "3rem";

export function clampSidebarWidthRem(rem: number): number {
  return Math.min(
    PAGE_SIDEBAR_MAX_WIDTH_REM,
    Math.max(PAGE_SIDEBAR_MIN_WIDTH_REM, rem)
  );
}

export function sidebarWidthRemToCss(rem: number): string {
  return `${clampSidebarWidthRem(rem)}rem`;
}

export function pixelsToRem(pixels: number): number {
  if (typeof document === "undefined") {
    return PAGE_SIDEBAR_DEFAULT_WIDTH_REM;
  }

  const rootFontSize = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize
  );
  return pixels / (rootFontSize || 16);
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
