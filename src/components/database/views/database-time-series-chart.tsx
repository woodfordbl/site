import { type ComponentProps, type ReactNode, useMemo } from "react";
import { Area, AreaChart, Line, LineChart, XAxis, YAxis } from "recharts";

import { DitherKitCartesian } from "@/components/charts/dither-kit-cartesian.tsx";
import { chartConfigPatch } from "@/components/database/views/database-chart-config-helpers.ts";
import {
  ChartLegendSlot,
  chartXAxisLabel,
  chartYAxisLabel,
  X_AXIS_TITLE_HEIGHT_PX,
  Y_AXIS_TITLE_WIDTH_PX,
} from "@/components/database/views/database-chart-parts.tsx";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  renderCartesianGrids,
  resolveCurveType,
  useAreaSoftGradient,
  useChartGlow,
  useChartGradientDither,
  useChartReveal,
} from "@/components/ui/chart.tsx";
import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import { updateDatabaseView } from "@/db/queries/database-collection-ops.ts";
import { formatCellValue } from "@/lib/databases/cell-values.ts";
import {
  type DatabaseChartConfig as ChartViewConfig,
  chartTokenIndex,
  resolveChartPaletteId,
} from "@/lib/databases/chart-data.ts";
import {
  DEFAULT_TIME_WINDOW_MS,
  presetForWindow,
  TIME_WINDOW_PRESETS,
} from "@/lib/databases/time-series-chart-data.ts";
import { useTimeSeriesChartData } from "@/lib/databases/use-time-series-chart-data.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Time-axis chart path (`chart.xMode === "time"`): a continuous numeric time
 * X-axis with one line/area series per synced row, fed by the async
 * `useTimeSeriesChartData` (stitched backfill + local capture + live). Reuses
 * the site chart system (`ChartContainer`, `--chart-N` tokens, gradient
 * dither) exactly like the categorical `CartesianChart`.
 */

const CHART_HEIGHT_CLASS = "h-80";

const DAY_MS = 86_400_000;

/** Axis tick formatter appropriate to the visible window width. */
function makeTimeFormatter(windowMs: number): (t: number) => string {
  if (windowMs <= DAY_MS) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return (t) => fmt.format(t);
  }
  if (windowMs <= 30 * DAY_MS) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    });
    return (t) => fmt.format(t);
  }
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  });
  return (t) => fmt.format(t);
}

const TOOLTIP_LABEL_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Re-express a series as % change from its first in-window point, so series of
 * very different magnitude (BTC vs a sub-$1 coin) share one axis and their
 * movement is visible. The baseline is the first finite non-zero value; each
 * point becomes `(v / base − 1) × 100`.
 */
function toPercentChange(points: FieldHistoryPoint[]): FieldHistoryPoint[] {
  const base = points.find((p) => Number.isFinite(p.v) && p.v !== 0)?.v;
  if (base === undefined) {
    return points.map((p) => ({ t: p.t, v: 0 }));
  }
  return points.map((p) => ({ t: p.t, v: (p.v / base - 1) * 100 }));
}

/** Signed percent label for the % change scale (e.g. `+1.24%`, `−0.30%`). */
function formatPercentChange(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

/**
 * Curve + fill styling for the time-series marks, derived from the shared chart
 * options (smoothing / gradient) and the workspace dither. Extracted as a hook
 * so the chart component stays under the complexity budget.
 */
function useTimeSeriesMarkStyle(
  chart: ChartViewConfig,
  chartConfig: ChartConfig,
  mark: "area" | "line"
) {
  // Default off: pixel staircase (dither-kit look) unless Smoothing is on.
  const smoothing = chart.smoothing === true;
  const gradient = chart.gradient !== false;
  const dither = useChartGradientDither(chartConfig, {
    gamma: mark === "area" && !gradient ? 0 : undefined,
  });
  const softGradient = useAreaSoftGradient(chartConfig, {
    enabled: mark === "area" && gradient && !dither.enabled,
  });
  const glow = useChartGlow();
  const reveal = useChartReveal();
  return {
    curveType: resolveCurveType(smoothing, dither),
    dither,
    glow,
    pixelated: dither.enabled && !smoothing,
    reveal,
    softGradient,
  };
}

/** Area fill: dither texture → soft vertical gradient → flat color, in order. */
function resolveTimeSeriesAreaFill(
  key: string,
  dither: { enabled: boolean; fill: (key: string) => string },
  softGradient: { enabled: boolean; fill: (key: string) => string }
): string {
  if (dither.enabled) {
    return dither.fill(key);
  }
  if (softGradient.enabled) {
    return softGradient.fill(key);
  }
  return `var(--color-${key})`;
}

type TimeSeriesTooltipFormatter = NonNullable<
  ComponentProps<typeof ChartTooltipContent>["formatter"]
>;

/** Tooltip row: swatch → series label → mono value, keyed by the series name. */
function makeTimeSeriesTooltipFormatter(
  chartConfig: ChartConfig,
  formatValue: (value: number) => string
): TimeSeriesTooltipFormatter {
  return (value, name, item) => {
    const label = chartConfig[String(name)]?.label ?? String(name);
    const swatch =
      (item as { color?: string })?.color ?? `var(--color-${String(name)})`;
    const display =
      typeof value === "number" ? formatValue(value) : String(value);
    return (
      <div className="flex flex-1 items-center gap-2 leading-none">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-[2px]"
          style={{ backgroundColor: swatch }}
        />
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto font-medium font-mono text-foreground tabular-nums">
          {display}
        </span>
      </div>
    );
  };
}

/** Tooltip header: the hovered point's timestamp, formatted. */
function timeSeriesLabelFormatter(
  _label: unknown,
  payload: readonly { payload?: { t?: number } }[]
): string {
  const t = payload?.[0]?.payload?.t;
  return typeof t === "number" ? TOOLTIP_LABEL_FORMAT.format(t) : "";
}

/** The dithered (dither-kit) time-series render: window control + canvas chart. */
function DitheredTimeSeries({
  chart,
  chartConfig,
  database,
  mark,
  palette,
  seriesEntries,
  timeFormatter,
  view,
  windowMs,
}: {
  chart: ChartViewConfig;
  chartConfig: ChartConfig;
  database: LocalDatabase;
  mark: "area" | "line";
  palette: ReturnType<typeof resolveChartPaletteId>;
  seriesEntries: { key: string; points: Record<string, number>[] }[];
  timeFormatter: (t: number) => string;
  view: DatabaseView;
  windowMs: number;
}): ReactNode {
  return (
    <div>
      <WindowControl
        activeWindowMs={windowMs}
        chart={chart}
        database={database}
        view={view}
      />
      <div className={cn("aspect-auto w-full", CHART_HEIGHT_CLASS)}>
        <DitherKitCartesian
          animate={false}
          config={chartConfig}
          data={mergeTimeSeriesRows(seriesEntries)}
          mark={mark}
          palette={palette}
          showLegend={chart.showLegend ?? seriesEntries.length > 1}
          showTooltip={chart.showTooltip !== false}
          xKey="t"
          xTickFormatter={(value) =>
            typeof value === "number" ? timeFormatter(value) : ""
          }
        />
      </div>
    </div>
  );
}

/** Merge per-series time points into unified rows keyed by timestamp. */
function mergeTimeSeriesRows(
  seriesEntries: { key: string; points: Record<string, number>[] }[]
): Record<string, number>[] {
  const byT = new Map<number, Record<string, number>>();
  for (const { key, points } of seriesEntries) {
    for (const point of points) {
      const row = byT.get(point.t) ?? { t: point.t };
      row[key] = point[key];
      byT.set(point.t, row);
    }
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

/**
 * Grids + X/Y axes + tooltip + legend for the Recharts time series. Extracted so
 * `DatabaseTimeSeriesChart` stays under the cognitive-complexity budget.
 */
function renderTimeSeriesAxes({
  chart,
  chartConfig,
  data,
  formatValue,
  seriesCount,
  timeFormatter,
  xAxisLabel,
  yAxisLabel,
}: {
  chart: ChartViewConfig;
  chartConfig: ChartConfig;
  data: ReturnType<typeof useTimeSeriesChartData>["data"];
  formatValue: (value: number) => string;
  seriesCount: number;
  timeFormatter: (t: number) => string;
  xAxisLabel: ReturnType<typeof chartXAxisLabel>;
  yAxisLabel: ReturnType<typeof chartYAxisLabel>;
}): ReactNode {
  const hasYBound = chart.yMin !== undefined || chart.yMax !== undefined;
  return (
    <>
      {renderCartesianGrids(chart)}
      <XAxis
        allowDataOverflow
        axisLine={false}
        dataKey="t"
        domain={data ? [data.from, data.to] : ["dataMin", "dataMax"]}
        height={xAxisLabel ? X_AXIS_TITLE_HEIGHT_PX : undefined}
        label={xAxisLabel}
        minTickGap={32}
        scale="time"
        tickFormatter={timeFormatter}
        tickLine={false}
        tickMargin={8}
        type="number"
      />
      <YAxis
        allowDataOverflow={hasYBound}
        axisLine={false}
        domain={[chart.yMin ?? "auto", chart.yMax ?? "auto"]}
        label={yAxisLabel}
        tickCount={chart.gridCount}
        tickFormatter={formatValue}
        tickLine={false}
        width={yAxisLabel ? Y_AXIS_TITLE_WIDTH_PX : "auto"}
      />
      {chart.showTooltip === false ? null : (
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={makeTimeSeriesTooltipFormatter(
                chartConfig,
                formatValue
              )}
              labelFormatter={timeSeriesLabelFormatter}
            />
          }
        />
      )}
      <ChartLegendSlot chart={chart} seriesCount={seriesCount} />
    </>
  );
}

type MarkStyle = ReturnType<typeof useTimeSeriesMarkStyle>;

/**
 * The Recharts area/line chart element for the time series. A plain function
 * (not a component) so the returned `<AreaChart>`/`<LineChart>` stays the direct
 * child of `ResponsiveContainer`; keeps `DatabaseTimeSeriesChart` under budget.
 */
function renderTimeSeriesPlot({
  axes,
  curveType,
  dither,
  glow,
  mark,
  reveal,
  seriesEntries,
  softGradient,
}: {
  axes: ReactNode;
  curveType: MarkStyle["curveType"];
  dither: MarkStyle["dither"];
  glow: MarkStyle["glow"];
  mark: "area" | "line";
  reveal: MarkStyle["reveal"];
  seriesEntries: { key: string; points: Record<string, number>[] }[];
  softGradient: MarkStyle["softGradient"];
}): ReactNode {
  if (mark === "area") {
    return (
      <AreaChart accessibilityLayer>
        {dither.defs}
        {softGradient.defs}
        {reveal.defs}
        {glow.defs}
        {axes}
        {seriesEntries.map(({ points, key }) => (
          <Area
            connectNulls
            data={points}
            dataKey={key}
            fill={resolveTimeSeriesAreaFill(key, dither, softGradient)}
            fillOpacity={dither.enabled || softGradient.enabled ? 1 : 0.3}
            isAnimationActive={false}
            key={key}
            name={key}
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            style={reveal.maskStyle}
            type={curveType}
          />
        ))}
      </AreaChart>
    );
  }
  return (
    <LineChart accessibilityLayer>
      {reveal.defs}
      {glow.defs}
      {axes}
      {seriesEntries.map(({ points, key }) => (
        <Line
          connectNulls
          data={points}
          dataKey={key}
          dot={false}
          isAnimationActive={false}
          key={key}
          name={key}
          stroke={`var(--color-${key})`}
          strokeWidth={2}
          style={reveal.maskStyle}
          type={curveType}
        />
      ))}
    </LineChart>
  );
}

interface DatabaseTimeSeriesChartProps {
  chart: ChartViewConfig;
  database: LocalDatabase;
  fields: DatabaseField[];
  mode: "view" | "edit";
  rows: LocalDatabaseRow[];
  view: DatabaseView;
}

/** Dashed guidance panel at chart height for unconfigured / empty states. */
function TimeSeriesEmptyState({
  hint,
  title,
}: {
  hint?: string;
  title: string;
}): ReactNode {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-border border-dashed px-4 text-center",
        CHART_HEIGHT_CLASS
      )}
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
  chart: ChartViewConfig;
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

export function DatabaseTimeSeriesChart({
  chart,
  database,
  fields,
  mode,
  rows,
  view,
}: DatabaseTimeSeriesChartProps): ReactNode {
  const fieldId = chart.timeSeries?.fieldId;
  const windowMs = chart.timeSeries?.windowMs ?? DEFAULT_TIME_WINDOW_MS;
  const percent = chart.timeSeries?.scale === "percent";
  const mark = chart.mark === "area" ? "area" : "line";
  const palette = resolveChartPaletteId(chart.palette);
  const yField = fields.find((field) => field.id === fieldId) ?? null;

  const { data, loading } = useTimeSeriesChartData(
    database,
    fields,
    rows,
    fieldId,
    windowMs
  );

  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    for (const [index, series] of (data?.series ?? []).entries()) {
      config[`s${String(index + 1)}`] = {
        label: series.label,
        color: `var(--chart-${String(chartTokenIndex(undefined, index))})`,
      };
    }
    return config;
  }, [data]);

  // Per-chart curve + fill options (smoothing / gradient) + stroke bloom and a
  // one-shot entrance wipe, all shared with the categorical chart config.
  const { curveType, dither, glow, pixelated, reveal, softGradient } =
    useTimeSeriesMarkStyle(chart, chartConfig, mark);
  const timeFormatter = makeTimeFormatter(windowMs);
  const xAxisLabel = chartXAxisLabel(chart.xAxisTitle);
  const yAxisLabel = chartYAxisLabel(chart.yAxisTitle);
  const formatValue = (value: number) => {
    if (percent) {
      return formatPercentChange(value);
    }
    return yField ? formatCellValue(yField, value) : String(value);
  };

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
    (series) => series.points.length > 0
  );

  if (!hasPoints) {
    return (
      <div>
        <WindowControl
          activeWindowMs={windowMs}
          chart={chart}
          database={database}
          view={view}
        />
        <TimeSeriesEmptyState
          hint={
            loading
              ? "Loading price history…"
              : "History appears as data is captured, or backfilled from the source."
          }
          title={loading ? "Loading…" : "No history yet"}
        />
      </div>
    );
  }

  const seriesEntries = (data?.series ?? []).map((series, index) => {
    const key = `s${String(index + 1)}`;
    const scaled = percent ? toPercentChange(series.points) : series.points;
    // Key each series' value by its own `key` (not a shared "v") so the legend
    // and tooltip — which resolve config by dataKey — can tell them apart.
    return {
      key,
      points: scaled.map((point) => ({ t: point.t, [key]: point.v })),
    };
  });

  // Dithered mode → the dither-kit engine (see DitheredTimeSeries).
  if (dither.enabled) {
    return (
      <DitheredTimeSeries
        chart={chart}
        chartConfig={chartConfig}
        database={database}
        mark={mark}
        palette={palette}
        seriesEntries={seriesEntries}
        timeFormatter={timeFormatter}
        view={view}
        windowMs={windowMs}
      />
    );
  }

  const axes = renderTimeSeriesAxes({
    chart,
    chartConfig,
    data,
    formatValue,
    seriesCount: seriesEntries.length,
    timeFormatter,
    xAxisLabel,
    yAxisLabel,
  });

  const plot = renderTimeSeriesPlot({
    axes,
    curveType,
    dither,
    glow,
    mark,
    reveal,
    seriesEntries,
    softGradient,
  });

  return (
    <div>
      <WindowControl
        activeWindowMs={windowMs}
        chart={chart}
        database={database}
        view={view}
      />
      <ChartContainer
        className={cn(
          "aspect-auto w-full",
          CHART_HEIGHT_CLASS,
          dither.fillCrispClassName,
          pixelated && dither.curveCrispClassName,
          glow.strokeClassName
        )}
        config={chartConfig}
        palette={palette}
        ref={dither.ref}
      >
        {plot}
      </ChartContainer>
    </div>
  );
}
