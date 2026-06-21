import { getCookie } from "@tanstack/react-start/server";

import {
  localPagesFromPreviewEntries,
  PAGE_LIST_LOCAL_PREVIEW_COOKIE_NAME,
  parsePageListLocalPreviewCookie,
} from "@/lib/pages/page-list-local-preview-cookie.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

/** Reads user page sidebar metadata from the request cookie for SSR. */
export function readPageListLocalPreviewFromRequest(): LocalPage[] {
  return localPagesFromPreviewEntries(
    parsePageListLocalPreviewCookie(
      getCookie(PAGE_LIST_LOCAL_PREVIEW_COOKIE_NAME)
    )
  );
}
