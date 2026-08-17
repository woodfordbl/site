import { areaY, defineChart, lineY, ruleX } from "@tanstack/charts";
import { type ReactNode, useCallback, useMemo } from "react";

import { ChartFrame } from "@/components/charts/chart-frame.tsx";
import { chartConfigPatch } from "@/components/database/views/database-chart-config-helpers.ts";
import {
  CHART_PLOT_HEIGHT_PX,
  chartLegendSlot,
} from "@/components/database/views/database-chart-parts.tsx";
import { updateDatabaseView } from "@/db/queries/database-collection-ops.ts";
import { chartSeriesToken } from "@/lib/charts/chart-palettes.ts";
import {
  CHART_STREAM_MOTION,
  CHART_THEME,
  type ChartSeriesColor,
  chartColorOptions,
  chartMargin,
  numberValueAxis,
  seriesTooltip,
  sessionTimeAxis,
} from "@/lib/charts/chart-spec.ts";
import { resolveAutoYDomain } from "@/lib/charts/chart-y-domain.ts";
import { detectClosedPeriods } from "@/lib/charts/session-time-scale.ts";
import { formatCellValue } from "@/lib/databases/cell-values.ts";
import {
  type DatabaseChartConfig,
  resolveChartPaletteId,
} from "@/lib/databases/chart-data.ts";
import {
  DEFAULT_TIME_WINDOW_MS,
  presetForWindow,
  TIME_WINDOW_PRESETS,
  windowSampleSpacingMs,
} from "@/lib/databases/time-series-chart-data.ts";
import {
  type TimeSeriesChartData,
  useTimeSeriesChartData,
} from "@/lib/databases/use-time-series-chart-data.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview Time-axis chart path (`chart.xMode === "time"`): a continuous
 * time X axis with one line or area per synced row, fed by the async
 * `useTimeSeriesChartData` (stitched backfill + local capture + live ticks).
 *
 * Timestamps stay epoch milliseconds on a linear scale rather than becoming
 * `Date`s: that is the shape the history store hands out, and a linear scale
 * ticks and inverts correctly across every window the control offers. The tick
 * formatter is what makes the axis read as time, and it follows the window —
 * clock times within a day, dates within a month, months beyond that.
 *
 * Two properties of the drawn path are deliberate and load-bearing for a price
 * series. It is **unsmoothed**: every vertex is an observation and every
 * segment is a straight line between two of them, so nothing on screen is
 * interpolated shape. And it is **unbroken** across a market closure: the axis
 * collapses the closed interval to no width, so Friday's close and Monday's
 * open sit adjacent and the overnight move reads as the single step it is,
 * rather than as a series of disconnected daily fragments. The dashed seam
 * marks are what keep that honest — they state where elapsed time was removed.
 */

const DAY_MS = 86_400_000;

/** Axis tick formatter appropriate to the visible window width. */
function makeTimeFormatter(windowMs: number): (t: number) => string {
  if (windowMs <= DAY_MS) {
    const format = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return (t) => format.format(t);
  }
  if (windowMs <= 30 * DAY_MS) {
    const format = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    });
    return (t) => format.format(t);
  }
  const format = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  });
  return (t) => format.format(t);
}

const PERCENT_TICK_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  style: "percent",
});

const TOOLTIP_TITLE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** One plotted sample: which series, when, and the (possibly rescaled) value. */
interface TimeSeriesRow {
  label: string;
  series: string;
  t: number;
  v: number;
}

/**
 * Re-express a series as % change from its first in-window point, so series of
 * very different magnitude (BTC against a sub-dollar coin) share one axis and
 * their movement stays visible. The baseline is the first finite non-zero value;
 * each point becomes `(v / base − 1) × 100`.
 */
function toPercentChange(
  points: readonly { t: number; v: number }[]
): { t: number; v: number }[] {
  const base = points.find(
    (point) => Number.isFinite(point.v) && point.v !== 0
  )?.v;
  if (base === undefined) {
    return points.map((point) => ({ t: point.t, v: 0 }));
  }
  return points.map((point) => ({ t: point.t, v: (point.v / base - 1) * 100 }));
}

/** Signed percent label for the % change scale (e.g. `+1.24%`, `−0.30%`). */
function formatPercentChange(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

/** Every series' samples as tidy rows, rescaled when the % scale is active. */
function timeSeriesRows(
  data: TimeSeriesChartData | null,
  percent: boolean
): TimeSeriesRow[] {
  return (data?.series ?? []).flatMap((series) => {
    const points = percent ? toPercentChange(series.points) : series.points;
    return points.map((point) => ({
      label: series.label,
      series: series.key,
      t: point.t,
      v: point.v,
    }));
  });
}

/** Dashed guidance panel at plot height for unconfigured / empty states. */
function TimeSeriesEmptyState({
  hint,
  title,
}: {
  hint?: string;
  title: string;
}): ReactNode {
  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-border border-dashed px-4 text-center"
      style={{ height: CHART_PLOT_HEIGHT_PX }}
    >
      <span className="font-medium text-muted-foreground text-sm">{title}</span>
      {hint ? (
        <span className="text-muted-foreground/70 text-xs">{hint}</span>
      ) : null}
    </div>
  );
}

/** 1D / 7D / 30D / 1Y segmented window control; persists to the view config. */
function WindowControl({
  activeWindowMs,
  chart,
  database,
  view,
}: {
  activeWindowMs: number;
  chart: DatabaseChartConfig;
  database: LocalDatabase;
  view: DatabaseView;
}): ReactNode {
  const activeId = presetForWindow(activeWindowMs).id;
  const setWindow = (windowMs: number) => {
    if (!chart.timeSeries) {
      return;
    }
    updateDatabaseView(
      database.id,
      view.id,
      chartConfigPatch(view, {
        timeSeries: { ...chart.timeSeries, windowMs },
      })
    );
  };
  return (
    <div className="mb-2 flex justify-end gap-1">
      {TIME_WINDOW_PRESETS.map((preset) => (
        <button
          aria-pressed={preset.id === activeId}
          className={cn(
            "rounded-md px-2 py-1 font-medium text-muted-foreground text-xs outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            preset.id === activeId && "bg-muted text-foreground"
          )}
          key={preset.id}
          onClick={() => setWindow(preset.windowMs)}
          type="button"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

interface DatabaseTimeSeriesChartProps {
  chart: DatabaseChartConfig;
  database: LocalDatabase;
  fields: DatabaseField[];
  mode: "view" | "edit";
  rows: LocalDatabaseRow[];
  view: DatabaseView;
}

export function DatabaseTimeSeriesChart({
  chart,
  database,
  fields,
  mode,
  rows,
  view,
}: DatabaseTimeSeriesChartProps): ReactNode {
  const fieldId = chart.timeSeries?.fieldId;
  // Snapped to a preset so a view saved against a window the control no longer
  // offers still highlights — and formats — as the nearest one it does.
  const windowMs = presetForWindow(
    chart.timeSeries?.windowMs ?? DEFAULT_TIME_WINDOW_MS
  ).windowMs;
  const percent = chart.timeSeries?.scale === "percent";
  const mark = chart.mark === "area" ? "area" : "line";
  const yField = fields.find((field) => field.id === fieldId) ?? null;

  const { data, loading } = useTimeSeriesChartData(
    database,
    fields,
    rows,
    fieldId,
    windowMs
  );

  const series = useMemo<ChartSeriesColor[]>(
    () =>
      (data?.series ?? []).map((entry, index) => ({
        key: entry.key,
        token: chartSeriesToken(index),
      })),
    [data]
  );

  // Stable across renders so the definition memo below can depend on it
  // directly instead of re-deriving the same formatter every render.
  const formatValue = useCallback(
    (value: number) => {
      if (chart.yFormat === "percent") {
        return PERCENT_TICK_FORMATTER.format(value);
      }
      if (percent) {
        return formatPercentChange(value);
      }
      return yField ? formatCellValue(yField, value) : String(value);
    },
    [chart.yFormat, percent, yField]
  );

  const definition = useMemo(() => {
    const plotted = timeSeriesRows(data, percent);
    // Closures are inferred from the samples themselves, so a 24/7 pair stays
    // linear and an instrument with nights and weekends compresses them out
    // without anyone naming a market calendar. `keep` opts out of the collapse
    // and spends real width on the closed interval instead. The window's own
    // candle spacing is the floor for what counts as a gap — without it the
    // fine live capture at the right edge drags the median down and every
    // candle step reads as a closure.
    const closed = detectClosedPeriods(
      plotted.map((row) => row.t),
      { minSpacingMs: windowSampleSpacingMs(windowMs) }
    );
    const time = sessionTimeAxis({
      closed: chart.timeSeries?.sessions === "keep" ? [] : closed,
      format: makeTimeFormatter(windowMs),
      grid: chart.gridVertical === true,
      samples: plotted.map((row) => row.t),
      title: chart.xAxisTitle,
    });
    const yDomain = resolveAutoYDomain({
      tickCount: chart.gridCount ?? 4,
      values: plotted.map((row) => row.v),
      yMax: chart.yMax,
      yMin: chart.yMin,
      // Prices and levels: zoom to the data band rather than anchoring at zero.
      zeroBased: false,
    });
    const channels = {
      x: "t",
      y: "v",
      z: "series",
      color: "series",
    } as const;
    // Keyed points plus rolling path motion are what make a live series animate
    // as the window advancing rather than as every sample changing value.
    const streaming = {
      key: (row: TimeSeriesRow) => `${row.series}:${row.t}`,
      motion: CHART_STREAM_MOTION,
    } as const;
    return defineChart(
      {
        marks: [
          // A seam wherever the axis removed time, so the compression is stated
          // rather than hidden. Rules own no chart points, so they stay out of
          // focus and the tooltip.
          ruleX(time.breaks, {
            stroke: "var(--border)",
            strokeDasharray: "3 3",
          }),
          // No `curve`: straight segments between observations. A monotone
          // spline through prices invents intermediate shape the market never
          // printed, and on a collapsed closure it would bow the overnight
          // step into something that looks like trading.
          mark === "area"
            ? areaY(plotted, {
                ...channels,
                ...streaming,
                fillOpacity: 0.25,
                strokeWidth: 2,
              })
            : lineY(plotted, {
                ...channels,
                ...streaming,
                strokeWidth: 2,
              }),
        ],
        x: time.axis,
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
            : seriesTooltip<TimeSeriesRow, number, number>({
                label: (point) => point.datum.label,
                title: (point) => TOOLTIP_TITLE_FORMAT.format(point.xValue),
                value: (point) => formatValue(point.yValue),
              }),
      }
    );
  }, [chart, data, formatValue, mark, percent, series, windowMs]);

  if (!fieldId) {
    return (
      <TimeSeriesEmptyState
        hint={
          mode === "edit"
            ? "Pick a captured number property to chart over time in the chart settings."
            : "This chart has no time property yet."
        }
        title="Pick a property to chart over time"
      />
    );
  }

  const hasPoints = (data?.series ?? []).some(
    (entry) => entry.points.length > 0
  );

  return (
    <div>
      <WindowControl
        activeWindowMs={windowMs}
        chart={chart}
        database={database}
        view={view}
      />
      {hasPoints ? (
        <ChartFrame
          ariaLabel="Time series chart"
          className="w-full"
          definition={definition}
          height={CHART_PLOT_HEIGHT_PX}
          legend={chartLegendSlot(chart, series, data?.series ?? [])}
          legendPosition={chart.legendPosition ?? "bottom"}
          palette={resolveChartPaletteId(chart.palette)}
        />
      ) : (
        <TimeSeriesEmptyState
          hint={
            loading
              ? "Loading price history…"
              : "History appears as data is captured, or backfilled from the source."
          }
          title={loading ? "Loading…" : "No history yet"}
        />
      )}
    </div>
  );
}
