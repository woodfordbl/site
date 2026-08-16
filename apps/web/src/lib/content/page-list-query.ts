import { queryOptions } from "@tanstack/react-query";

import { listPages } from "@/lib/content/list-pages.ts";

export const pageListQueryOptions = queryOptions({
  queryKey: ["pages", "list"],
  queryFn: () => listPages(),
  staleTime: Number.POSITIVE_INFINITY,
});
