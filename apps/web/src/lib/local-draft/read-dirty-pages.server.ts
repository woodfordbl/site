import { getCookie } from "@tanstack/react-start/server";

import {
  DIRTY_PAGES_COOKIE_NAME,
  parseDirtyPageIds,
} from "@/lib/local-draft/dirty-pages-cookie.ts";

export function readDirtyPageIdsFromRequest(): Set<string> {
  return parseDirtyPageIds(getCookie(DIRTY_PAGES_COOKIE_NAME));
}
