import { createServerFn } from "@tanstack/react-start";
import { serializeDirtyPageIds } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { readDirtyPageIdsFromRequest } from "@/lib/local-draft/read-dirty-pages.server.ts";

export const getDirtyPageIds = createServerFn({ method: "GET" }).handler(
  async () => serializeDirtyPageIds(readDirtyPageIdsFromRequest())
);
