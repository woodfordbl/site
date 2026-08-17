import type { ChartColorToken } from "@/lib/charts/chart-palettes.ts";
import type { ChartSeriesColor } from "@/lib/charts/chart-spec.ts";
import {
  type ChartData,
  type ChartDataSeries,
  chartTokenIndex,
} from "@/lib/databases/chart-data.ts";

/**
 * @fileoverview Bridge from the chart-view dataset (`chart-data.ts`, a
 * column-oriented `categories × series` shape) to the tidy rows TanStack Charts
 * marks consume.
 *
 * A mark takes one flat iterable and maps fields onto channels, so the series
 * split that `ChartData` holds as parallel arrays becomes a `series` column
 * here. Keeping the transform in one place is what lets bar, line, and area
 * share a single dataset and a single tooltip.
 */

/** One plotted point: which category, which series, and the aggregated value. */
export interface DatabaseChartSeriesRow {
  category: string;
  /** Display label for the series — the tooltip and legend text. */
  label: string;
  /** Stable series key; the mark's `color` and `z` channel. */
  series: string;
  /**
   * The aggregate for this cell. `null` marks an empty bucket, which line and
   * area marks render as a gap rather than a drop to zero.
   */
  value: number | null;
}

/**
 * The dataset as tidy rows, in series-then-category order. Rows are emitted for
 * every (series, category) pair — including empty ones — so a stack keeps its
 * segment order and a line keeps its gap.
 */
export function databaseChartSeriesRows(
  data: ChartData
): DatabaseChartSeriesRow[] {
  return data.series.flatMap((series) =>
    data.categories.map((category, index) => ({
      category,
      label: series.label,
      series: series.key,
      value: series.points[index] ?? null,
    }))
  );
}

/**
 * The color scale domain for a dataset: one entry per series, in dataset order,
 * carrying the series' override token or its cycled default.
 */
export function chartSeriesColors(
  series: readonly ChartDataSeries[]
): ChartSeriesColor[] {
  return series.map((entry, index) => ({
    key: entry.key,
    token: chartTokenIndex(entry.color, index),
  }));
}

/**
 * Per-slice color tokens for a pie: categories are the series there, so
 * overrides key on the category bucket key rather than a series key.
 */
export function chartCategoryColors(
  categoryKeys: readonly string[],
  overrideFor: (key: string) => ChartColorToken | undefined
): ChartSeriesColor[] {
  return categoryKeys.map((key, index) => ({
    key,
    token: chartTokenIndex(overrideFor(key), index),
  }));
}
