import {
  parseDirtyPageIds,
  readDirtyPageIdsFromDocument,
} from "@/lib/local-draft/dirty-pages-cookie.ts";
import { getDirtyPageIds } from "@/lib/local-draft/get-dirty-page-ids.ts";

export async function loadDirtyPageIds(): Promise<Set<string>> {
  if (typeof window === "undefined") {
    return parseDirtyPageIds(await getDirtyPageIds());
  }

  return readDirtyPageIdsFromDocument();
}
