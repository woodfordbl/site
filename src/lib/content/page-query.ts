import { queryOptions } from "@tanstack/react-query";

import { loadPage } from "@/lib/content/load-page.ts";

export function pageBySlugQueryOptions(slug: string) {
  return queryOptions({
    queryKey: ["pages", "by-slug", slug],
    queryFn: () => loadPage({ data: { slug } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
