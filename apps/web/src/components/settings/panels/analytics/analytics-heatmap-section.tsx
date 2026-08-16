import { ActivityHeatmapGrid } from "@/components/settings/panels/analytics/activity-heatmap.tsx";
import { AnalyticsSection } from "@/components/settings/panels/analytics/analytics-section.tsx";
import type { ActivityHeatmap } from "@/lib/pages/page-activity-analytics.ts";

const WEEKDAY_LABELS = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

function formatHour(hour: number): string {
  if (hour === 0) {
    return "12am";
  }
  if (hour === 12) {
    return "12pm";
  }
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

interface AnalyticsHeatmapSectionProps {
  heatmap: ActivityHeatmap;
}

export function AnalyticsHeatmapSection({
  heatmap,
}: AnalyticsHeatmapSectionProps) {
  const peak = heatmap.peak;
  const description = peak
    ? `You're most active on ${WEEKDAY_LABELS[peak.weekday]} around ${formatHour(peak.hour)}.`
    : "When you tend to work, by hour and weekday.";

  return (
    <AnalyticsSection description={description} title="When you write">
      <ActivityHeatmapGrid heatmap={heatmap} />
    </AnalyticsSection>
  );
}
