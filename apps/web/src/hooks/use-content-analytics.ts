import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { sitePagesQueryOptions } from "@/lib/content/site-pages-query.ts";
import {
  computeContentStats,
  computeWordFrequency,
  type PageContentInput,
} from "@/lib/pages/content-stats.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { Page } from "@/lib/schemas/page.ts";

/**
 * Resolves the current block set for every non-deleted page: the local shard
 * when the user has edited the page, otherwise the shipped page's blocks. This
 * gives complete content coverage without double-counting locally-edited
 * shipped pages.
 */
function useContentInputs(): PageContentInput[] {
  const { catalog } = useMergedPageListItems();
  const { data: shippedPages } = useQuery(sitePagesQueryOptions);

  return useMemo(() => {
    const shippedById = new Map<string, Page>(
      (shippedPages ?? []).map((page) => [page.id, page])
    );

    const inputs: PageContentInput[] = [];
    for (const entry of catalog) {
      if (entry.origin === "tombstoned") {
        continue;
      }

      const pageId = entry.summary.id;
      const localBlocks = readBlockShardForPage(pageId);
      const blocks: Block[] =
        localBlocks.length > 0
          ? localBlocks
          : (shippedById.get(pageId)?.blocks ?? []);

      inputs.push({
        pageId,
        title: entry.summary.title,
        icon: entry.summary.icon,
        blocks,
      });
    }

    return inputs;
  }, [catalog, shippedPages]);
}

export function useContentAnalytics() {
  const inputs = useContentInputs();
  const { isLoading } = useQuery(sitePagesQueryOptions);

  const contentStats = useMemo(() => computeContentStats(inputs), [inputs]);
  const wordFrequency = useMemo(
    () => computeWordFrequency(inputs, 50),
    [inputs]
  );

  return { contentStats, wordFrequency, isLoading };
}
