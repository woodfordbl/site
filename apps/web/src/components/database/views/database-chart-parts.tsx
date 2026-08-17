import type { ReactNode } from "react";

import { ChartLegend, ChartLegendContent } from "@/components/ui/chart.tsx";
import type { DatabaseChartConfig as ChartViewConfig } from "@/lib/databases/chart-data.ts";

/**
 * Chart pieces shared by the categorical (`database-chart-view.tsx`) and
 * time-axis (`database-time-series-chart.tsx`) renderers, so both honor the
 * same `view.config.chart` keys (legend, axis titles) identically.
 */

/** Extra XAxis band height reserved for an axis title under the ticks. */
export const X_AXIS_TITLE_HEIGHT_PX = 48;

/** YAxis width when a rotated axis title sits beside the ticks. */
export const Y_AXIS_TITLE_WIDTH_PX = 64;

/** Recharts `label` prop object for an X axis title, or undefined when unset. */
export function chartXAxisLabel(title: string | undefined) {
  const trimmed = title?.trim();
  if (!trimmed) {
    return;
  }
  return {
    className: "fill-muted-foreground text-xs",
    offset: 0,
    position: "insideBottom" as const,
    value: trimmed,
  };
}

/** Recharts `label` prop object for a Y axis title, or undefined when unset. */
export function chartYAxisLabel(title: string | undefined) {
  const trimmed = title?.trim();
  if (!trimmed) {
    return;
  }
  return {
    angle: -90,
    className: "fill-muted-foreground text-xs",
    position: "insideLeft" as const,
    style: { textAnchor: "middle" as const },
    value: trimmed,
  };
}

export interface ChartLegendSlotProps {
  chart: ChartViewConfig;
  /** Config lookup key name on datum objects (pie); cartesian legends omit it. */
  nameKey?: string;
  seriesCount: number;
}

/**
 * Legend per config: shown when `showLegend` is set, defaulting to on only
 * for multi-series charts (a single series is named by its context — no
 * legend box). Position maps top/bottom/right onto Recharts alignment.
 */
export function ChartLegendSlot({
  chart,
  nameKey,
  seriesCount,
}: ChartLegendSlotProps): ReactNode {
  const show = chart.showLegend ?? seriesCount > 1;
  if (!show) {
    return null;
  }
  const position = chart.legendPosition ?? "bottom";
  if (position === "right") {
    return (
      <ChartLegend
        align="right"
        content={
          <ChartLegendContent
            className="flex-col items-start gap-2 pt-0 pl-4"
            nameKey={nameKey}
          />
        }
        layout="vertical"
        verticalAlign="middle"
      />
    );
  }
  return (
    <ChartLegend
      content={<ChartLegendContent nameKey={nameKey} />}
      verticalAlign={position}
    />
  );
}
