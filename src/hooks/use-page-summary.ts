import { useMemo } from "react";

import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";

export function usePageSummary(pageId: string | null): PageSummary | null {
  const { pages } = useMergedPageListItems();

  return useMemo(() => {
    if (!pageId) {
      return null;
    }

    return pages.find((page) => page.id === pageId) ?? null;
  }, [pageId, pages]);
}
