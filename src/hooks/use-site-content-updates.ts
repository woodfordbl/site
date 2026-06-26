import { useMemo } from "react";

import { useLocalPages } from "@/hooks/use-local-pages.ts";
import { usePageListItems } from "@/hooks/use-page-list.ts";
import { findStaleOverriddenPageIds } from "@/lib/pages/resolve-page-state.ts";

export interface SiteContentUpdates {
  hasUpdates: boolean;
  stalePageIds: string[];
}

/**
 * Detects overridden shipped pages whose shipped content changed since the
 * user's local copy, so the footer can offer a global "Refresh site content"
 * pull without opening each page.
 */
export function useSiteContentUpdates(): SiteContentUpdates {
  const { pages: serverPages } = usePageListItems();
  const localPages = useLocalPages();

  const stalePageIds = useMemo(
    () => findStaleOverriddenPageIds(serverPages, localPages),
    [serverPages, localPages]
  );

  return {
    hasUpdates: stalePageIds.length > 0,
    stalePageIds,
  };
}
