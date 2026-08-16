import { getPageSidebarPrefs } from "@/lib/pages/get-page-sidebar-prefs.ts";
import { readPageListExpandedIdsFromDocument } from "@/lib/pages/page-list-expanded-cookie.ts";
import { readPageSidebarWidthFromDocument } from "@/lib/pages/page-sidebar-layout-cookie.ts";
import {
  type PageSidebarPrefs,
  readPageSidebarPinFromDocument,
} from "@/lib/pages/page-sidebar-pin-cookie.ts";

export function loadPageSidebarPrefs(): Promise<PageSidebarPrefs> {
  if (typeof window === "undefined") {
    return getPageSidebarPrefs();
  }

  return Promise.resolve({
    expandedPageIds: [...readPageListExpandedIdsFromDocument()],
    pin: readPageSidebarPinFromDocument(),
    widthRem: readPageSidebarWidthFromDocument(),
  });
}
