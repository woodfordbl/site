import { useQuery } from "@tanstack/react-query";

import { readAllPageActivityEvents } from "@/db/activity/page-activity-store.ts";
import {
  bucketEventsByDay,
  countEventsByPage,
  countEventsByType,
} from "@/lib/pages/page-activity-analytics.ts";
import type { PageActivityEvent } from "@/lib/pages/page-activity-events.ts";

export const siteActivityAnalyticsQueryKey = [
  "site-activity-analytics",
] as const;

function fetchSiteActivityAnalytics(): Promise<PageActivityEvent[]> {
  return readAllPageActivityEvents();
}

export function useSiteActivityAnalytics(enabled = true) {
  const query = useQuery({
    enabled,
    queryFn: fetchSiteActivityAnalytics,
    queryKey: siteActivityAnalyticsQueryKey,
    staleTime: 60_000,
  });

  const events = query.data ?? [];

  return {
    byDay: bucketEventsByDay(events),
    byPage: countEventsByPage(events),
    byType: countEventsByType(events),
    events,
    isLoading: query.isLoading,
    refetch: query.refetch,
    totalEvents: events.length,
  };
}
