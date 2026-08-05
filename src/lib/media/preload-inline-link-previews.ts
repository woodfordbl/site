import type { QueryClient } from "@tanstack/react-query";

import {
  urlPreviewQueryKey,
  urlPreviewQueryOptions,
} from "@/lib/media/url-preview-query.ts";

/** Max parallel OG unfurls when idle-preloading an open page. */
export const INLINE_LINK_PREVIEW_PRELOAD_CONCURRENCY = 3;

/**
 * Prefetch OG metadata for page link hrefs with a concurrency cap.
 * Skips URLs already present in the TanStack Query cache.
 */
export async function preloadInlineLinkPreviews(
  queryClient: QueryClient,
  urls: readonly string[],
  options?: {
    concurrency?: number;
    signal?: AbortSignal;
  }
): Promise<void> {
  const concurrency = Math.max(
    1,
    options?.concurrency ?? INLINE_LINK_PREVIEW_PRELOAD_CONCURRENCY
  );
  const signal = options?.signal;
  const pending = urls.filter((url) => {
    if (!url) {
      return false;
    }
    return queryClient.getQueryData(urlPreviewQueryKey(url)) === undefined;
  });

  if (pending.length === 0) {
    return;
  }

  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < pending.length) {
      if (signal?.aborted) {
        return;
      }
      const index = nextIndex;
      nextIndex += 1;
      const url = pending[index];
      if (!url) {
        return;
      }
      try {
        await queryClient.prefetchQuery(urlPreviewQueryOptions(url));
      } catch {
        // Failures surface on hover query; keep warming the rest.
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, pending.length) },
    () => worker()
  );
  await Promise.all(workers);
}
