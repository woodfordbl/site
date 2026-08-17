import type { ReactNode } from "react";

import { ChartLegend } from "@/components/charts/chart-legend.tsx";
import { chartSeriesColor } from "@/lib/charts/chart-palettes.ts";
import type { ChartSeriesColor } from "@/lib/charts/chart-spec.ts";
import type { DatabaseChartConfig } from "@/lib/databases/chart-data.ts";

/**
 * @fileoverview Pieces shared by the three chart-saved-view renderers
 * (`database-cartesian-chart.tsx`, `database-pie-chart.tsx`,
 * `database-time-series-chart.tsx`), so every one of them honors the same
 * `view.config.chart` keys identically.
 */

/** Plot height for a chart saved view. Width tracks the view's container. */
export const CHART_PLOT_HEIGHT_PX = 320;

/**
 * The legend a chart's config asks for, or nothing. Shown when `showLegend` is
 * set, defaulting to on only for multi-series charts — a single series is named
 * by its surroundings and a one-entry legend box is noise.
 *
 * Labels come from the dataset and colors from the resolved color scale, so the
 * two lists are zipped by position: `colors[i]` is the token `labels[i]` paints
 * in, both in dataset order.
 */
export function chartLegendSlot(
  chart: DatabaseChartConfig,
  colors: readonly ChartSeriesColor[],
  labelled: readonly { label: string }[]
): ReactNode {
  const show = chart.showLegend ?? colors.length > 1;
  if (!show) {
    return null;
  }
  return (
    <ChartLegend
      items={colors.map((entry, index) => ({
        color: chartSeriesColor(entry.token),
        key: String(entry.key),
        label: labelled[index]?.label ?? String(entry.key),
      }))}
      position={chart.legendPosition ?? "bottom"}
    />
  );
}
