import { type QueryClient, queryOptions } from "@tanstack/react-query";

import type { UrlPreview } from "@/lib/media/parse-url-preview.ts";
import { unfurlEmbedUrl } from "@/lib/media/unfurl-embed-url.ts";
import { warmUrlPreviewAssets } from "@/lib/media/warm-url-preview-assets.ts";

/** Client cache TTL for hover / embed OG unfurls. */
export const URL_PREVIEW_STALE_TIME_MS = 5 * 60 * 1000;

/** TanStack Query key for a URL's Open Graph preview. */
export function urlPreviewQueryKey(url: string) {
  return ["url-preview", url] as const;
}

/**
 * Query options for OG metadata via the shared embed unfurl server fn.
 * Prefetch on idle page warm / hover; reuse the same cache for open popovers.
 * Image and favicon URLs are warmed into the browser cache when the payload arrives.
 */
export function urlPreviewQueryOptions(url: string) {
  return queryOptions({
    queryFn: async (): Promise<UrlPreview> => {
      const preview = await unfurlEmbedUrl({ data: { url } });
      warmUrlPreviewAssets(preview);
      return preview;
    },
    queryKey: urlPreviewQueryKey(url),
    staleTime: URL_PREVIEW_STALE_TIME_MS,
  });
}

/** Prefetch one URL into the query cache (no-op for empty). */
export function prefetchUrlPreview(
  queryClient: QueryClient,
  url: string
): void {
  if (!url) {
    return;
  }
  queryClient.prefetchQuery(urlPreviewQueryOptions(url)).catch(() => {
    // Failures surface when the popover queries.
  });
}
