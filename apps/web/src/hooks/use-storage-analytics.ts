import { useQuery } from "@tanstack/react-query";

import {
  computeStorageStats,
  type StorageStats,
} from "@/lib/pages/storage-stats.ts";

export const siteStorageAnalyticsQueryKey = ["site-storage-analytics"] as const;

export function useStorageAnalytics(enabled = true) {
  const query = useQuery<StorageStats>({
    enabled,
    queryFn: computeStorageStats,
    queryKey: siteStorageAnalyticsQueryKey,
    staleTime: 60_000,
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
