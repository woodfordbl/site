import { createServerFn } from "@tanstack/react-start";

import { getShippedPages } from "@/lib/content/page-store.server.ts";
import type { Page } from "@/lib/schemas/page.ts";

/**
 * Every shipped page with its full block list, in one round trip. Backs the
 * workspace export, which needs shipped bodies (not just summaries) to build a
 * self-contained snapshot.
 */
export const loadAllPages = createServerFn({ method: "GET" }).handler(
  (): Promise<Page[]> => getShippedPages()
);
