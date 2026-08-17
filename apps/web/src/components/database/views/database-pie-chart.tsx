import { defineChart } from "@tanstack/charts";
import { focusGroupAngle, pie, polar, radialArc } from "@tanstack/charts/polar";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { type ReactNode, useMemo } from "react";

import { ChartFrame } from "@/components/charts/chart-frame.tsx";
import {
  CHART_PLOT_HEIGHT_PX,
  chartLegendSlot,
} from "@/components/database/views/database-chart-parts.tsx";
import {
  CHART_THEME,
  chartColorOptions,
  seriesTooltip,
} from "@/lib/charts/chart-spec.ts";
import {
  type ChartData,
  chartColorOverride,
  type DatabaseChartConfig,
  type DatabaseChartYAggregate,
  formatChartYValue,
  resolveChartPaletteId,
} from "@/lib/databases/chart-data.ts";
import { chartCategoryColors } from "@/lib/databases/chart-series-rows.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

/**
 * @fileoverview The pie mark for a chart saved view: one slice per X-axis
 * bucket, sized by the bucket's aggregate.
 *
 * A pie has no Cartesian axes — the `polar` container supplies its own angle and
 * radius scales, and the spec therefore omits `x`/`y` entirely. Categories play
 * the role series play elsewhere: they are the color-scale domain, so per-slice
 * color overrides key on the bucket key rather than a series key.
 */

/** One slice before the pie transform allocates its angles. */
interface PieSlice {
  /** Stable bucket key — the color-scale domain value and slice identity. */
  key: string;
  label: string;
  value: number;
}

interface DatabasePieChartProps {
  aggregate: DatabaseChartYAggregate;
  chart: DatabaseChartConfig;
  data: ChartData;
  yField: DatabaseField | null;
}

export function DatabasePieChart({
  aggregate,
  chart,
  data,
  yField,
}: DatabasePieChartProps): ReactNode {
  const slices = useMemo<PieSlice[]>(
    () =>
      data.categoryKeys.map((key, index) => ({
        key,
        label: data.categories[index],
        value: data.series[0]?.points[index] ?? 0,
      })),
    [data]
  );
  const colors = useMemo(
    () =>
      chartCategoryColors(data.categoryKeys, (key) =>
        chartColorOverride(chart, key)
      ),
    [chart, data]
  );

  const definition = useMemo(() => {
    const formatValue = (value: number) =>
      formatChartYValue(aggregate, yField, value, chart.yFormat);
    return defineChart(
      {
        marks: [
          polar({
            radiusRatio: 0.92,
            angle: { scale: scaleLinear().domain([0, Math.PI * 2]) },
            radius: { scale: scaleLinear().domain([0, 1]) },
            marks: [
              radialArc(pie(slices, { value: "value" }), {
                key: "key",
                color: "key",
                // A hairline in the page color separates adjacent slices
                // without introducing a second ink color.
                stroke: "var(--background)",
                strokeWidth: 2,
              }),
            ],
          }),
        ],
        color: chartColorOptions(colors),
        margin: 4,
        theme: CHART_THEME,
      },
      {
        focus: focusGroupAngle,
        tooltip:
          chart.showTooltip === false
            ? false
            : seriesTooltip({
                // A slice's magnitude is its allocated value, not its radius.
                label: (point) => point.datum.label,
                title: (point) => point.datum.label,
                value: (point) => formatValue(point.datum.value),
              }),
      }
    );
  }, [aggregate, chart, colors, slices, yField]);

  return (
    <ChartFrame
      ariaLabel="Pie chart"
      className="w-full"
      definition={definition}
      height={CHART_PLOT_HEIGHT_PX}
      legend={chartLegendSlot(chart, colors, slices)}
      legendPosition={chart.legendPosition ?? "bottom"}
      palette={resolveChartPaletteId(chart.palette)}
    />
  );
}
