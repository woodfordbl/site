import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { pageListQueryOptions } from "@/lib/content/page-list-query.ts";
import { mergePageList } from "@/lib/pages/merge-page-list.ts";

import { useLocalPages } from "./use-local-pages.ts";

/** SSR-safe page list from shipped content (React Query). */
export function usePageListItems() {
  const { data: serverPages = [] } = useQuery(pageListQueryOptions);

  return { pages: serverPages };
}

/** Merged shipped + local page list (SSR uses shipped pages only). */
export function useMergedPageListItems() {
  const { pages: serverPages } = usePageListItems();
  const localPages = useLocalPages();
  const pages = useMemo(
    () => mergePageList(serverPages, localPages),
    [localPages, serverPages]
  );

  return { pages };
}
