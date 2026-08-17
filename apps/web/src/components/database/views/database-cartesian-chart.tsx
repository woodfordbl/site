import {
  areaY,
  barY,
  defineChart,
  group,
  lineY,
  ruleY,
  stack,
} from "@tanstack/charts";
import { type ReactNode, useMemo } from "react";

import { ChartFrame } from "@/components/charts/chart-frame.tsx";
import {
  CHART_PLOT_HEIGHT_PX,
  chartLegendSlot,
} from "@/components/database/views/database-chart-parts.tsx";
import {
  CHART_SMOOTH_CURVE,
  CHART_THEME,
  categoryBandAxis,
  categoryPointAxis,
  chartColorOptions,
  chartMargin,
  minorGridValues,
  numberValueAxis,
  seriesTooltip,
} from "@/lib/charts/chart-spec.ts";
import {
  isZeroBasedAggregate,
  resolveAutoYDomain,
} from "@/lib/charts/chart-y-domain.ts";
import {
  type ChartData,
  type DatabaseChartConfig,
  type DatabaseChartMark,
  type DatabaseChartYAggregate,
  formatChartYValue,
  resolveChartPaletteId,
} from "@/lib/databases/chart-data.ts";
import {
  chartSeriesColors,
  type DatabaseChartSeriesRow,
  databaseChartSeriesRows,
} from "@/lib/databases/chart-series-rows.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

/**
 * @fileoverview The categorical Cartesian marks for a chart saved view — bar
 * (grouped or stacked), line, and area (stackable).
 *
 * All three share one dataset shape and one spec skeleton; only the mark
 * function and its layout differ. That is deliberate: tooltip, legend, palette,
 * grid, axis titles, and Y domain then behave identically across marks, so
 * switching mark in the chart settings cannot change anything else about how
 * the chart reads.
 *
 * Bars take a banded X scale — they paint intervals, so they need band width.
 * Lines and areas take a point scale, which puts the first and last vertex on
 * the plot edges instead of inset by half a band.
 */

/** Marks with a `stacked` option, and the layout each gets when it is set. */
function cartesianMark(
  mark: Exclude<DatabaseChartMark, "pie">,
  rows: readonly DatabaseChartSeriesRow[],
  options: {
    order: readonly string[];
    smoothing: boolean;
    stacked: boolean;
  }
) {
  // Every mark carries the same point identity. That is what lets a mark
  // animate an update instead of a redraw when the underlying rows change —
  // a synced database, a formula recompute, a filter edit. No chart opts into
  // "live"; keyed points make any data change animate correctly.
  const channels = {
    x: "category",
    y: "value",
    z: "series",
    color: "series",
    key: (row: DatabaseChartSeriesRow) => `${row.category}:${row.series}`,
  } as const;
  if (mark === "bar") {
    return barY(rows, {
      ...channels,
      // Grouped bars sit side by side inside each band; stacked bars share one.
      layout: options.stacked
        ? stack({ order: options.order })
        : group({ padding: 0.15 }),
      radius: 4,
    });
  }
  const curve = options.smoothing ? CHART_SMOOTH_CURVE : undefined;
  // No rolling path motion here: a categorical X domain does not shift, so an
  // update is a morph in place, which is the library default.
  if (mark === "line") {
    return lineY(rows, { ...channels, curve, strokeWidth: 2 });
  }
  return areaY(rows, {
    ...channels,
    curve,
    fillOpacity: 0.3,
    layout: options.stacked ? stack({ order: options.order }) : undefined,
    strokeWidth: 2,
  });
}

/**
 * Every magnitude the Y domain must cover: the per-series values normally, and
 * the per-category totals when marks stack — a stack is taller than any of its
 * segments.
 */
function plottedMagnitudes(data: ChartData, stacked: boolean): number[] {
  return data.categories.flatMap((_category, index) => {
    const perSeries = data.series.map((series) => series.points[index] ?? 0);
    return stacked
      ? [perSeries.reduce((sum, value) => sum + value, 0)]
      : perSeries;
  });
}

interface DatabaseCartesianChartProps {
  aggregate: DatabaseChartYAggregate;
  chart: DatabaseChartConfig;
  data: ChartData;
  mark: Exclude<DatabaseChartMark, "pie">;
  yField: DatabaseField | null;
}

export function DatabaseCartesianChart({
  aggregate,
  chart,
  data,
  mark,
  yField,
}: DatabaseCartesianChartProps): ReactNode {
  const series = useMemo(() => chartSeriesColors(data.series), [data]);

  const definition = useMemo(() => {
    const stacked = chart.stacked === true;
    const formatValue = (value: number) =>
      formatChartYValue(aggregate, yField, value, chart.yFormat);
    const yDomain = resolveAutoYDomain({
      tickCount: chart.gridCount ?? 4,
      values: plottedMagnitudes(data, stacked),
      yMax: chart.yMax,
      yMin: chart.yMin,
      zeroBased: stacked || isZeroBasedAggregate(aggregate),
    });
    const minors =
      chart.showGrid === false
        ? []
        : minorGridValues(
            [yDomain.min, yDomain.max],
            chart.gridCount ?? 4,
            chart.gridMinor ?? 0
          );
    const xAxis =
      mark === "bar"
        ? categoryBandAxis({ title: chart.xAxisTitle })
        : categoryPointAxis({ title: chart.xAxisTitle });
    return defineChart(
      {
        marks: [
          // Subdivisions between the major gridlines. A rule mark owns no chart
          // points, so it draws without joining focus or the tooltip.
          ruleY(minors, {
            stroke: "var(--border)",
            strokeDasharray: "2 4",
            strokeOpacity: 0.55,
          }),
          cartesianMark(mark, databaseChartSeriesRows(data), {
            order: series.map((entry) => String(entry.key)),
            smoothing: chart.smoothing ?? true,
            stacked,
          }),
        ],
        x: { ...xAxis, grid: chart.gridVertical === true },
        y: numberValueAxis({
          domain: [yDomain.min, yDomain.max],
          format: formatValue,
          grid: chart.showGrid !== false,
          ticks: chart.gridCount,
          title: chart.yAxisTitle,
        }),
        color: chartColorOptions(series),
        margin: chartMargin({ x: chart.xAxisTitle, y: chart.yAxisTitle }),
        theme: CHART_THEME,
      },
      {
        focus: "group-x",
        tooltip:
          chart.showTooltip === false
            ? false
            : seriesTooltip<DatabaseChartSeriesRow, string, number>({
                label: (point) => point.datum.label,
                value: (point) => formatValue(point.yValue),
              }),
      }
    );
  }, [aggregate, chart, data, mark, series, yField]);

  return (
    <ChartFrame
      ariaLabel={`${mark} chart`}
      className="w-full"
      definition={definition}
      height={CHART_PLOT_HEIGHT_PX}
      legend={chartLegendSlot(chart, series, data.series)}
      legendPosition={chart.legendPosition ?? "bottom"}
      palette={resolveChartPaletteId(chart.palette)}
    />
  );
}
