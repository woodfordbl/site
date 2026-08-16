import type { QueryClient } from "@tanstack/react-query";

import { getQueryClient } from "@/db/client.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { pageListQueryOptions } from "@/lib/content/page-list-query.ts";
import { pageBySlugQueryOptions } from "@/lib/content/page-query.ts";
import type { Page } from "@/lib/schemas/page.ts";

function pageSummaryFromPage(page: Page): PageSummary {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    parentId: page.parentId,
    sidebarOrder: page.sidebarOrder,
    icon: page.icon,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    contentHash: hashPageBlocks(page.blocks),
  };
}

/** Matches loader / warm-cache keying: home is the literal `"home"`. */
function querySlugForPage(page: Pick<Page, "slug">): string {
  return page.slug === "/" ? "home" : page.slug;
}

/**
 * Seeds the client React Query caches with a page that `savePage` just wrote,
 * so tearing down the local overlay never falls back to the pre-save shipped
 * document. Updates both the per-slug entry and the page-list summary (matched
 * by id so a rename lands under the new slug and drops the old list row).
 *
 * Open routes (`/` and `/$`) subscribe to `pageBySlugQueryOptions` via
 * `useQuery`, so `setQueryData` alone updates `serverPage` props — do **not**
 * await `router.invalidate()` before clearing local overlays (Start
 * SSR-revalidation can hang on client-only trees).
 */
export function publishSavedPageToClient(
  page: Page,
  queryClient: QueryClient = getQueryClient()
): void {
  const previousList = queryClient.getQueryData<PageSummary[]>(
    pageListQueryOptions.queryKey
  );
  const previousSummary = previousList?.find((entry) => entry.id === page.id);
  if (previousSummary && previousSummary.slug !== page.slug) {
    queryClient.removeQueries({
      queryKey: pageBySlugQueryOptions(querySlugForPage(previousSummary))
        .queryKey,
    });
  }

  queryClient.setQueryData(
    pageBySlugQueryOptions(querySlugForPage(page)).queryKey,
    page
  );

  const summary = pageSummaryFromPage(page);
  queryClient.setQueryData(
    pageListQueryOptions.queryKey,
    (previous: PageSummary[] | undefined) => {
      if (!previous) {
        return [summary];
      }

      const index = previous.findIndex((entry) => entry.id === page.id);
      if (index === -1) {
        return [...previous, summary];
      }

      const next = previous.slice();
      next[index] = summary;
      return next;
    }
  );
}
