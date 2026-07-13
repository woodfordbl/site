import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { DitherKitCartesian } from "@/components/charts/dither-kit-cartesian.tsx";
import {
  ChartLegendSlot,
  chartXAxisLabel,
  chartYAxisLabel,
  X_AXIS_TITLE_HEIGHT_PX,
  Y_AXIS_TITLE_WIDTH_PX,
} from "@/components/database/views/database-chart-parts.tsx";
import { DatabaseTimeSeriesChart } from "@/components/database/views/database-time-series-chart.tsx";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  renderCartesianGrids,
  resolveCurveType,
  useAreaSoftGradient,
  useChartDither,
  useChartGlow,
  useChartGradientDither,
  useChartReveal,
} from "@/components/ui/chart.tsx";
import type { ChartPaletteId } from "@/lib/charts/chart-palettes.ts";
import {
  buildChartData,
  CHART_Y_AGGREGATE_LABELS,
  type ChartData,
  type DatabaseChartConfig as ChartViewConfig,
  chartColorOverride,
  chartTokenIndex,
  type DatabaseChartMark,
  type DatabaseChartYAggregate,
  DEFAULT_CHART_MARK,
  DEFAULT_CHART_Y_AGGREGATE,
  formatChartYValue,
  resolveChartPaletteId,
  resolveChartXField,
  resolveChartYField,
} from "@/lib/databases/chart-data.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Chart saved view: renders `view.config.chart` (mark/axes/series/palette)
 * over the entry-computed row pipeline on the site chart system —
 * `ChartContainer` + `--chart-1..5` tokens, workspace palette + dither aware.
 * Configuration lives in the database ⋯ settings menu's "Chart options"
 * submenu (`ChartOptionsItems`); the chart surface itself stays control-free
 * in both modes (tooltips remain interactive).
 */

/** Props contract for saved-view renderers mounted by `database-table-view.tsx`. */
export interface DatabaseChartViewProps {
  database: LocalDatabase;
  /** Full field schema (visibility is a per-view concern, applied here). */
  fields: DatabaseField[];
  mode: "view" | "edit";
  /** Filtered + sorted + formula-merged rows computed by the entry. */
  rows: LocalDatabaseRow[];
  /** The saved view being rendered (`view.type === "chart"`). */
  view: DatabaseView;
}

/** ~320px plot height; width stays fluid. */
const CHART_HEIGHT_CLASS = "h-80";

/** Rounded data ends on the topmost bar segment, anchored to the baseline. */
const BAR_END_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

const EMPTY_CHART_CONFIG: ChartViewConfig = {};

/**
 * `prefers-reduced-motion`, live-updated. Recharts mount/update animations
 * are disabled when set; hover tooltips remain (state, not motion).
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
    };
    query.addEventListener("change", handleChange);
    return () => {
      query.removeEventListener("change", handleChange);
    };
  }, []);
  return reduced;
}

type TooltipFormatter = NonNullable<
  ComponentProps<typeof ChartTooltipContent>["formatter"]
>;

/**
 * Tooltip row renderer matching `ChartTooltipContent`'s default anatomy
 * (swatch → muted series label → mono value) but with the Y value formatted
 * per the field's display config instead of a bare `toLocaleString`. The
 * swatch reads `--color-<key>` so it follows palette and theme, and stays a
 * solid color even when the mark itself is dither-patterned.
 */
function makeTooltipFormatter(
  config: ChartConfig,
  formatValue: (value: number) => string
): TooltipFormatter {
  return (value, name) => {
    const key = String(name);
    return (
      <>
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ backgroundColor: `var(--color-${key})` }}
        />
        <div className="flex flex-1 items-center justify-between gap-4 leading-none">
          <span className="text-muted-foreground">
            {config[key]?.label ?? key}
          </span>
          <span className="font-medium font-mono text-foreground tabular-nums">
            {typeof value === "number" ? formatValue(value) : String(value)}
          </span>
        </div>
      </>
    );
  };
}

/** Area fill: dither texture → soft vertical gradient → flat color, in order. */
function resolveAreaFill(
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

interface CartesianChartProps {
  aggregate: DatabaseChartYAggregate;
  chart: ChartViewConfig;
  data: ChartData;
  mark: Exclude<DatabaseChartMark, "pie">;
  palette: ChartPaletteId | undefined;
  yField: DatabaseField | null;
}

/** Bar (grouped/stacked), line, and area (stackable) marks. */
function CartesianChart({
  aggregate,
  chart,
  data,
  mark,
  palette,
  yField,
}: CartesianChartProps): ReactNode {
  const reduceMotion = usePrefersReducedMotion();

  // Series keys are user data (text values can hold spaces/quotes), so the
  // Recharts dataKeys / CSS color vars use positional `s1..sN` aliases;
  // labels and color overrides stay attached to the raw series.
  const { chartConfig, chartRows } = useMemo(() => {
    const config: ChartConfig = {};
    for (const [index, series] of data.series.entries()) {
      config[`s${String(index + 1)}`] = {
        label: series.label,
        color: `var(--chart-${String(chartTokenIndex(series.color, index))})`,
      };
    }
    const rowsData = data.categories.map((category, categoryIndex) => {
      const record: Record<string, string | number | null> = { category };
      for (const [index, series] of data.series.entries()) {
        record[`s${String(index + 1)}`] = series.points[categoryIndex];
      }
      return record;
    });
    return { chartConfig: config, chartRows: rowsData };
  }, [data]);

  const seriesKeys = Object.keys(chartConfig);
  // Per-chart curve + fill options (both default on).
  // Default off: dithered charts read as a pixel staircase (the dither-kit
  // look); turn Smoothing on for a monotone curve.
  const smoothing = chart.smoothing === true;
  const gradient = chart.gradient !== false;
  // Flatten the dither fade for areas when the gradient is off (gamma 0 =
  // uniform density); other marks keep the default fade.
  const dither = useChartGradientDither(chartConfig, {
    gamma: mark === "area" && !gradient ? 0 : undefined,
  });
  // Non-dithered area fade, for when the workspace dither is off but the
  // gradient option is on.
  const softGradient = useAreaSoftGradient(chartConfig, {
    enabled: mark === "area" && gradient && !dither.enabled,
  });
  // Smoothing off + dither on = crisp pixel staircase; otherwise smooth
  // (monotone) or straight (linear) per the smoothing option.
  const pixelated = dither.enabled && !smoothing;
  const curveType = resolveCurveType(smoothing, dither);
  // Line/area strokes get a soft colour bloom and a one-shot entrance wipe; bars
  // keep their native grow. Both compose with the dither above.
  const wantsPolish = mark === "line" || mark === "area";
  const glow = useChartGlow({ enabled: wantsPolish });
  const reveal = useChartReveal({ enabled: wantsPolish });
  const introAnimation = !(reduceMotion || reveal.enabled);

  // Dithered mode renders through the vendored dither-kit canvas engine, fed by
  // the same chartConfig/chartRows. Non-dithered mode falls through to the
  // Recharts renderer below. The workspace "Chart dither" setting is the switch.
  if (dither.enabled) {
    return (
      <div className={cn("aspect-auto w-full", CHART_HEIGHT_CLASS)}>
        <DitherKitCartesian
          animate={!reduceMotion}
          config={chartConfig}
          data={chartRows}
          gradient={gradient}
          gridMinor={chart.gridMinor ?? 0}
          gridVertical={chart.gridVertical === true}
          legendPosition={chart.legendPosition ?? "bottom"}
          mark={mark}
          palette={palette}
          showGrid={chart.showGrid !== false}
          showLegend={chart.showLegend ?? data.series.length > 1}
          showTooltip={chart.showTooltip !== false}
          smooth={smoothing}
          stacked={chart.stacked === true}
          tickCount={chart.gridCount}
          xAxisTitle={chart.xAxisTitle}
          xKey="category"
          yAxisTitle={chart.yAxisTitle}
          yMax={chart.yMax}
          yMin={chart.yMin}
        />
      </div>
    );
  }

  const formatValue = (value: number) =>
    formatChartYValue(aggregate, yField, value);
  const tooltipFormatter = makeTooltipFormatter(chartConfig, formatValue);
  const stacked = chart.stacked === true;
  // Horizontal (value-axis) gridlines carry the major/minor ruler; vertical
  // (category-axis) lines are a plain toggle. Minor lines subdivide each major
  // gap and render fainter/dashed.
  const grid = renderCartesianGrids(chart);
  const xAxisLabel = chartXAxisLabel(chart.xAxisTitle);
  const yAxisLabel = chartYAxisLabel(chart.yAxisTitle);
  const xAxis = (
    <XAxis
      axisLine={false}
      dataKey="category"
      height={xAxisLabel ? X_AXIS_TITLE_HEIGHT_PX : undefined}
      label={xAxisLabel}
      minTickGap={16}
      tickLine={false}
      tickMargin={8}
    />
  );
  const hasYBound = chart.yMin !== undefined || chart.yMax !== undefined;
  const yAxis = (
    <YAxis
      allowDataOverflow={hasYBound}
      allowDecimals={aggregate !== "count"}
      axisLine={false}
      domain={[chart.yMin ?? "auto", chart.yMax ?? "auto"]}
      label={yAxisLabel}
      tickCount={chart.gridCount}
      tickFormatter={formatValue}
      tickLine={false}
      width={yAxisLabel ? Y_AXIS_TITLE_WIDTH_PX : 48}
    />
  );
  const tooltip =
    chart.showTooltip === false ? null : (
      <ChartTooltip
        content={<ChartTooltipContent formatter={tooltipFormatter} />}
      />
    );
  const legend = (
    <ChartLegendSlot chart={chart} seriesCount={data.series.length} />
  );

  let plot: ReactNode;
  if (mark === "bar") {
    plot = (
      <BarChart accessibilityLayer data={chartRows}>
        {dither.defs}
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {seriesKeys.map((key, index) => (
          <Bar
            dataKey={key}
            fill={dither.fill(key)}
            isAnimationActive={!reduceMotion}
            key={key}
            radius={
              dither.barRadius ??
              (!stacked || index === seriesKeys.length - 1 ? BAR_END_RADIUS : 0)
            }
            stackId={stacked ? "stack" : undefined}
          />
        ))}
        {legend}
      </BarChart>
    );
  } else if (mark === "line") {
    plot = (
      <LineChart accessibilityLayer data={chartRows}>
        {reveal.defs}
        {glow.defs}
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {seriesKeys.map((key) => (
          <Line
            connectNulls={false}
            dataKey={key}
            dot={false}
            isAnimationActive={introAnimation}
            key={key}
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            style={reveal.maskStyle}
            type={curveType}
          />
        ))}
        {legend}
      </LineChart>
    );
  } else {
    plot = (
      <AreaChart accessibilityLayer data={chartRows}>
        {dither.defs}
        {softGradient.defs}
        {reveal.defs}
        {glow.defs}
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        {seriesKeys.map((key) => (
          <Area
            connectNulls={false}
            dataKey={key}
            fill={resolveAreaFill(key, dither, softGradient)}
            fillOpacity={dither.enabled || softGradient.enabled ? 1 : 0.4}
            isAnimationActive={introAnimation}
            key={key}
            stackId={stacked ? "stack" : undefined}
            stroke={`var(--color-${key})`}
            strokeWidth={2}
            style={reveal.maskStyle}
            type={curveType}
          />
        ))}
        {legend}
      </AreaChart>
    );
  }

  return (
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
  );
}

interface PieMarkChartProps {
  aggregate: DatabaseChartYAggregate;
  chart: ChartViewConfig;
  data: ChartData;
  palette: ChartPaletteId | undefined;
  yField: DatabaseField | null;
}

/** Pie mark: one slice per category, colors cycling the palette tokens. */
function PieMarkChart({
  aggregate,
  chart,
  data,
  palette,
  yField,
}: PieMarkChartProps): ReactNode {
  const reduceMotion = usePrefersReducedMotion();

  // Category labels are user data — same positional `c1..cN` aliasing as the
  // cartesian series keys; per-slice overrides key on the stable bucket key.
  const { chartConfig, pieRows } = useMemo(() => {
    const config: ChartConfig = {};
    const rowsData = data.categories.map((label, index) => {
      const key = `c${String(index + 1)}`;
      const token = chartTokenIndex(
        chartColorOverride(chart, data.categoryKeys[index]),
        index
      );
      config[key] = { label, color: `var(--chart-${String(token)})` };
      return { name: key, value: data.series[0]?.points[index] ?? 0 };
    });
    return { chartConfig: config, pieRows: rowsData };
  }, [chart, data]);

  const dither = useChartDither(chartConfig);
  const formatValue = (value: number) =>
    formatChartYValue(aggregate, yField, value);
  const tooltipFormatter = makeTooltipFormatter(chartConfig, formatValue);
  const slices = pieRows.map((entry) => ({
    ...entry,
    fill: dither.fill(entry.name),
  }));

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", CHART_HEIGHT_CLASS)}
      config={chartConfig}
      palette={palette}
    >
      <PieChart accessibilityLayer>
        {dither.defs}
        <ChartTooltip
          content={<ChartTooltipContent formatter={tooltipFormatter} />}
        />
        <Pie
          data={slices}
          dataKey="value"
          isAnimationActive={!reduceMotion}
          nameKey="name"
          stroke="var(--background)"
          strokeWidth={2}
        />
        <ChartLegendSlot
          chart={chart}
          nameKey="name"
          seriesCount={data.categories.length}
        />
      </PieChart>
    </ChartContainer>
  );
}

/** Dashed guidance panel at chart height for unconfigured / empty states. */
function ChartEmptyState({
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

export function DatabaseChartView({
  database,
  fields,
  mode,
  rows,
  view,
}: DatabaseChartViewProps): ReactNode {
  const chart = view.config.chart ?? EMPTY_CHART_CONFIG;
  const mark = chart.mark ?? DEFAULT_CHART_MARK;
  const aggregate = chart.yAggregate ?? DEFAULT_CHART_Y_AGGREGATE;
  const xField = resolveChartXField(fields, chart);
  const yField = resolveChartYField(fields, chart);
  const palette = resolveChartPaletteId(chart.palette);
  const data = useMemo(
    () => buildChartData(fields, rows, chart),
    [fields, rows, chart]
  );

  // Time-axis charts take a separate async-loaded path (history + backfill).
  if (chart.xMode === "time") {
    return (
      <DatabaseTimeSeriesChart
        chart={chart}
        database={database}
        fields={fields}
        mode={mode}
        rows={rows}
        view={view}
      />
    );
  }

  let body: ReactNode;
  if (!xField) {
    body = (
      <ChartEmptyState
        hint={
          mode === "edit"
            ? "Choose an X axis property in the chart settings."
            : "This chart has no X axis property yet."
        }
        title="Pick a field to chart"
      />
    );
  } else if (aggregate !== "count" && !yField) {
    body = (
      <ChartEmptyState
        hint="Pick a number property to aggregate in the chart settings, or switch the Y value to Count."
        title={`${CHART_Y_AGGREGATE_LABELS[aggregate]} needs a number property`}
      />
    );
  } else if (data.categories.length === 0) {
    body = (
      <ChartEmptyState
        hint="Rows matching this view will appear here."
        title="No data to chart"
      />
    );
  } else if (mark === "pie") {
    body = (
      <PieMarkChart
        aggregate={aggregate}
        chart={chart}
        data={data}
        palette={palette}
        yField={yField}
      />
    );
  } else {
    body = (
      <CartesianChart
        aggregate={aggregate}
        chart={chart}
        data={data}
        mark={mark}
        palette={palette}
        yField={yField}
      />
    );
  }

  return body;
}
