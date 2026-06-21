import { getCookie } from "@tanstack/react-start/server";

import {
  PAGE_LIST_EXPANDED_COOKIE_NAME,
  parsePageListExpandedIds,
} from "@/lib/pages/page-list-expanded-cookie.ts";
import {
  PAGE_SIDEBAR_WIDTH_COOKIE_NAME,
  parsePageSidebarWidthCookie,
} from "@/lib/pages/page-sidebar-layout-cookie.ts";
import {
  PAGE_SIDEBAR_PIN_COOKIE_NAME,
  type PageSidebarPrefs,
  parsePageSidebarPinCookie,
} from "@/lib/pages/page-sidebar-pin-cookie.ts";

/** Reads sidebar pin + width from the request cookie header for SSR. */
export function readPageSidebarPrefsFromRequest(): PageSidebarPrefs {
  return {
    expandedPageIds: [
      ...parsePageListExpandedIds(getCookie(PAGE_LIST_EXPANDED_COOKIE_NAME)),
    ],
    pin: parsePageSidebarPinCookie(getCookie(PAGE_SIDEBAR_PIN_COOKIE_NAME)),
    widthRem: parsePageSidebarWidthCookie(
      getCookie(PAGE_SIDEBAR_WIDTH_COOKIE_NAME)
    ),
  };
}
