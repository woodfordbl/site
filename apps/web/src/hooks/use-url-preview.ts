import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  prefetchUrlPreview,
  urlPreviewQueryOptions,
} from "@/lib/media/url-preview-query.ts";

/**
 * Load Open Graph preview metadata for a URL (shared with embed unfurl).
 * Set `enabled` when hover intent opens the preview so idle links stay quiet.
 */
export function useUrlPreview(url: string, enabled = true) {
  return useQuery({
    ...urlPreviewQueryOptions(url),
    enabled: enabled && url.length > 0,
  });
}

/**
 * Prefetch OG metadata into the TanStack Query cache (hover intent / warm).
 * No-ops for empty URLs; safe to call repeatedly for the same href.
 */
export function usePrefetchUrlPreview() {
  const queryClient = useQueryClient();

  return (url: string) => {
    prefetchUrlPreview(queryClient, url);
  };
}
