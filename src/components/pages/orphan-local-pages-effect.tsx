"use client";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { useLocalPages } from "@/hooks/use-local-pages.ts";
import { usePageListItems } from "@/hooks/use-page-list.ts";
import { resetPageToRemote } from "@/lib/pages/reset-page-to-remote.ts";
import { findOrphanLocalPages } from "@/lib/pages/resolve-page-state.ts";

/** Prompts once per orphan overlay when a shipped page was removed from the catalog. */
export function OrphanLocalPagesEffect() {
  const { pages: serverPages } = usePageListItems();
  const localPages = useLocalPages();
  const dismissedRef = useRef(new Set<string>());

  const orphans = useMemo(
    () => findOrphanLocalPages(serverPages, localPages),
    [localPages, serverPages]
  );

  useEffect(() => {
    for (const orphan of orphans) {
      if (dismissedRef.current.has(orphan.id)) {
        continue;
      }

      dismissedRef.current.add(orphan.id);

      toast.error(`Local copy of "${orphan.title}" is no longer on the site`, {
        action: {
          label: "Discard",
          onClick: () => {
            resetPageToRemote(orphan.id);
          },
        },
        duration: Number.POSITIVE_INFINITY,
      });
    }
  }, [orphans]);

  return null;
}
