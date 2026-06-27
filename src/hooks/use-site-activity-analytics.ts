import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { readAllPageActivityEvents } from "@/db/activity/page-activity-store.ts";
import {
  bucketEventsByDay,
  bucketEventsByDayDetailed,
  buildActivityHeatmap,
  computeActivityStreak,
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

export function useSiteActivityAnalytics(enabled = true, days = 30) {
  const query = useQuery({
    enabled,
    queryFn: fetchSiteActivityAnalytics,
    queryKey: siteActivityAnalyticsQueryKey,
    staleTime: 60_000,
  });

  const events = useMemo(() => query.data ?? [], [query.data]);

  const byDayDetailed = useMemo(
    () => bucketEventsByDayDetailed(events, days),
    [events, days]
  );
  const byPage = useMemo(() => countEventsByPage(events), [events]);
  const byType = useMemo(() => countEventsByType(events), [events]);
  const heatmap = useMemo(() => buildActivityHeatmap(events), [events]);
  const streak = useMemo(() => computeActivityStreak(events), [events]);

  return {
    byDay: bucketEventsByDay(events, days),
    byDayDetailed,
    byPage,
    byType,
    heatmap,
    streak,
    events,
    isLoading: query.isLoading,
    refetch: query.refetch,
    totalEvents: events.length,
  };
}
