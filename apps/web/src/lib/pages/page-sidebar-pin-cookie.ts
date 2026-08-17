import {
  readDocumentCookie,
  writeDocumentCookie,
} from "@/lib/cookies/document-cookie.ts";

/** Cookie for pinned vs collapsed page sidebar chrome (`site-page-sidebar-pin`). */
export const PAGE_SIDEBAR_PIN_COOKIE_NAME = "site-page-sidebar-pin";

export type PageSidebarPin = "pinned" | "collapsed";

export interface PageSidebarPrefs {
  /** Expanded sidebar parent rows — array (not Set) so router context dehydrates. */
  expandedPageIds: string[];
  pin: PageSidebarPin;
  widthRem: number;
}

/** Parses raw pin cookie value (defaults to pinned when missing). */
export function parsePageSidebarPinCookie(
  value: string | undefined
): PageSidebarPin {
  return value === "0" ? "collapsed" : "pinned";
}

/** Reads pin preference from `document.cookie` (defaults to pinned on SSR / missing). */
export function readPageSidebarPinFromDocument(): PageSidebarPin {
  return parsePageSidebarPinCookie(
    readDocumentCookie(PAGE_SIDEBAR_PIN_COOKIE_NAME)
  );
}

/** Persists pin preference (`1` pinned, `0` collapsed). */
export function writePageSidebarPinToDocument(pin: PageSidebarPin): void {
  writeDocumentCookie(
    PAGE_SIDEBAR_PIN_COOKIE_NAME,
    pin === "pinned" ? "1" : "0"
  );
}
