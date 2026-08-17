import { areaY, barY, defineChart, stack } from "@tanstack/charts";
import { type ReactNode, useCallback, useMemo } from "react";

import { ChartFrame } from "@/components/charts/chart-frame.tsx";
import { ChartLegend } from "@/components/charts/chart-legend.tsx";
import {
  type ChartColorToken,
  chartSeriesColor,
} from "@/lib/charts/chart-palettes.ts";
import {
  CHART_SMOOTH_CURVE,
  CHART_THEME,
  categoryBandAxis,
  chartColorOptions,
  numberValueAxis,
  seriesTooltip,
} from "@/lib/charts/chart-spec.ts";

/**
 * @fileoverview The analytics board shape: per-day activity as bars, and the
 * running total that activity produces as a strip beneath them.
 *
 * The two live in separate plots on purpose. A day's delta and an all-time
 * cumulative total differ by orders of magnitude, so putting them on one value
 * axis flattens the bars to nothing — and putting the total on a second,
 * differently-scaled axis inside the same plot invites reading a crossing as
 * meaningful when it is an artifact of two arbitrary scales. Two plots keep both
 * series honestly scaled.
 *
 * The plots share the category domain and pin the same horizontal margins, so
 * one date lands on the same pixel column in both and the pair reads as a single
 * chart with one time axis at the bottom.
 */

/** Left margin pinned on both plots so their category columns line up. */
const SHARED_PLOT_MARGIN = { left: 44, right: 8 } as const;

const BARS_HEIGHT_PX = 168;

const TOTAL_STRIP_HEIGHT_PX = 64;

/** One bar segment: which day, which category, how many. */
export interface DeltaBarRow {
  /** `YYYY-MM-DD` — the band domain value, unique within any range. */
  day: string;
  /** Series label, carried on the row so the tooltip needs no lookup. */
  label: string;
  /** Series key; the color and stack channel. */
  series: string;
  value: number;
}

/** One point on the running-total strip. */
export interface TotalRow {
  day: string;
  label: string;
  series: string;
  value: number;
}

/** A series' identity and palette token for the color scale and legend. */
export interface BoardSeries {
  key: string;
  label: string;
  token: ChartColorToken;
}

export interface DeltaTotalBoardProps {
  ariaLabel: string;
  barSeries: readonly BoardSeries[];
  bars: readonly DeltaBarRow[];
  /** `YYYY-MM-DD` → short axis label (e.g. `Jun 21`). */
  dayLabels: ReadonlyMap<string, string>;
  formatValue: (value: number) => string;
  total: readonly TotalRow[];
  totalSeries: BoardSeries;
}

export function DeltaTotalBoard({
  ariaLabel,
  bars,
  barSeries,
  dayLabels,
  formatValue,
  total,
  totalSeries,
}: DeltaTotalBoardProps): ReactNode {
  const formatDay = useCallback(
    (day: string) => dayLabels.get(day) ?? day,
    [dayLabels]
  );

  const barsDefinition = useMemo(
    () =>
      defineChart(
        {
          marks: [
            barY(bars, {
              x: "day",
              y: "value",
              z: "series",
              color: "series",
              key: (row: DeltaBarRow) => `${row.day}:${row.series}`,
              layout: stack({ order: barSeries.map((entry) => entry.key) }),
              radius: 3,
            }),
          ],
          // The strip below carries the shared date labels for both plots.
          x: {
            ...categoryBandAxis({}),
            axis: { line: false, ticks: false, tickLabels: false },
          },
          y: numberValueAxis({ format: formatValue, ticks: 4 }),
          color: chartColorOptions(barSeries),
          margin: { ...SHARED_PLOT_MARGIN, top: 8, bottom: 0 },
          theme: CHART_THEME,
        },
        {
          focus: "group-x",
          tooltip: seriesTooltip<DeltaBarRow, string, number>({
            label: (point) => point.datum.label,
            title: (point) => formatDay(point.xValue),
            value: (point) => formatValue(point.yValue),
          }),
        }
      ),
    [bars, barSeries, formatDay, formatValue]
  );

  const totalDefinition = useMemo(
    () =>
      defineChart(
        {
          marks: [
            areaY(total, {
              x: "day",
              y: "value",
              color: "series",
              curve: CHART_SMOOTH_CURVE,
              fillOpacity: 0.22,
              strokeWidth: 1.5,
            }),
          ],
          x: {
            ...categoryBandAxis({ format: formatDay }),
            grid: false,
          },
          // Two ticks: the strip shows shape and endpoints, not fine readings.
          y: numberValueAxis({ format: formatValue, grid: false, ticks: 2 }),
          color: chartColorOptions([totalSeries]),
          margin: { ...SHARED_PLOT_MARGIN, top: 4, bottom: 0 },
          theme: CHART_THEME,
        },
        {
          focus: "group-x",
          tooltip: seriesTooltip<TotalRow, string, number>({
            label: (point) => point.datum.label,
            title: (point) => formatDay(point.xValue),
            value: (point) => formatValue(point.yValue),
          }),
        }
      ),
    [formatDay, formatValue, total, totalSeries]
  );

  return (
    <div className="flex flex-col">
      <ChartFrame
        ariaLabel={ariaLabel}
        definition={barsDefinition}
        height={BARS_HEIGHT_PX}
      />
      <ChartFrame
        ariaLabel={`${totalSeries.label} over time`}
        definition={totalDefinition}
        height={TOTAL_STRIP_HEIGHT_PX}
      />
      <ChartLegend
        items={[...barSeries, totalSeries].map((entry) => ({
          color: chartSeriesColor(entry.token),
          key: entry.key,
          label: entry.label,
        }))}
      />
    </div>
  );
}
