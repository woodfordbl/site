import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { getShippedPages } from "@/lib/content/page-store.server.ts";
import type { Page } from "@/lib/schemas/page.ts";

/**
 * Returns every shipped page with full block content. Used by the analytics
 * panel to compute content stats over pages the user has never opened locally
 * (which therefore have no local block shard). Small payload — the shipped
 * catalog is a handful of pages.
 */
export const loadSitePages = createServerFn({ method: "GET" }).handler(
  (): Promise<Page[]> => Promise.resolve(getShippedPages())
);

export const sitePagesQueryOptions = queryOptions({
  queryKey: ["site-pages", "full"],
  queryFn: () => loadSitePages(),
  staleTime: Number.POSITIVE_INFINITY,
});
