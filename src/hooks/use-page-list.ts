import { useQuery } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { useMemo } from "react";

import { pageListQueryOptions } from "@/lib/content/page-list-query.ts";
import { resolvePageCatalog } from "@/lib/pages/resolve-page-state.ts";

import { useLocalPages } from "./use-local-pages.ts";

/** SSR-safe page list from shipped content (React Query). */
export function usePageListItems() {
  const { serverPages: ssrServerPages } = useLoaderData({ from: "__root__" });
  const { data: serverPagesFromQuery } = useQuery(pageListQueryOptions);
  const pages = useMemo(() => {
    if (serverPagesFromQuery && serverPagesFromQuery.length > 0) {
      return serverPagesFromQuery;
    }

    return ssrServerPages;
  }, [serverPagesFromQuery, ssrServerPages]);

  return { pages };
}

/** Merged shipped + local page list. SSR and hydration use the preview cookie; live collection after ready. */
export function useMergedPageListItems() {
  const { pages: serverPages } = usePageListItems();
  const localPages = useLocalPages();
  const catalog = useMemo(
    () => resolvePageCatalog(serverPages, localPages),
    [localPages, serverPages]
  );
  const pages = useMemo(() => catalog.map((entry) => entry.summary), [catalog]);

  return { catalog, pages };
}
