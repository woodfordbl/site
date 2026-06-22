"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { useLayoutEffect } from "react";

const PAGES_CATALOG_REVISION_KEY = "site-pages-catalog-revision";

/** Refetches the shipped page list when a new deploy changes the catalog revision. */
export function SyncPagesCatalogRevisionEffect() {
  const { pagesCatalogRevision } = useLoaderData({ from: "__root__" });
  const queryClient = useQueryClient();

  useLayoutEffect(() => {
    const stored = localStorage.getItem(PAGES_CATALOG_REVISION_KEY);

    if (stored === pagesCatalogRevision) {
      return;
    }

    localStorage.setItem(PAGES_CATALOG_REVISION_KEY, pagesCatalogRevision);

    if (stored != null) {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
    }
  }, [pagesCatalogRevision, queryClient]);

  return null;
}
