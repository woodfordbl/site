import type {
  ChartAxisOptions,
  ChartColorOptions,
  ChartCurve,
  ChartKey,
  ChartMargin,
  ChartMotionDefinition,
  ChartPoint,
  ChartTheme,
  ChartTooltipOptions,
  ChartTooltipRow,
  ChartValue,
} from "@tanstack/charts";
import { d3Curve } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleOrdinal } from "@tanstack/charts/scales/ordinal";
import { scalePoint } from "@tanstack/charts/scales/point";
import { type ChartTooltipExtension, tooltip } from "@tanstack/charts/tooltip";
import { curveMonotoneX, curveStepAfter } from "d3-shape";

import {
  type ChartColorToken,
  chartSeriesColor,
} from "@/lib/charts/chart-palettes.ts";
import {
  type ClosedPeriod,
  sessionTimeScale,
} from "@/lib/charts/session-time-scale.ts";

/**
 * @fileoverview The site's chart grammar: the pieces of a `defineChart` spec
 * that every chart in the app shares.
 *
 * TanStack Charts is renderer-neutral and unstyled — a spec names its own
 * theme, scales, color range, and tooltip shape. This module is the single
 * place those decisions are made, so a bar chart in a database view and a
 * sparkline in the analytics panel resolve identical colors, gridlines, tick
 * typography, and tooltip anatomy.
 *
 * Two invariants hold across everything here:
 *
 * - **Colors are tokens, never literals.** Ranges are `var(--chart-N)`
 *   references (see `lib/charts/chart-palettes.ts`), resolved by the
 *   `[data-chart-palette]` scope the chart renders inside. That is what makes a
 *   palette switch — and dark mode — a pure CSS change with no re-render.
 * - **Scales come from the compact subset.** `@tanstack/charts/scales/*` covers
 *   band/point/linear/ordinal, keeping `d3-scale` out of the chart bundle; only
 *   a scale whose semantics exceed that subset should reach for D3.
 */

/**
 * Theme tokens handed to every chart: axis/tick ink follows
 * `--muted-foreground`, gridlines `--border`, and the plot background stays
 * transparent so the surrounding card shows through. `palette` is unset here —
 * charts pass an explicit color range built from their own series tokens.
 */
export const CHART_THEME: Partial<ChartTheme> = {
  background: "transparent",
  foreground: "var(--muted-foreground)",
  grid: "var(--border)",
};

/** Plot margin with no axis titles: just enough room for tick labels. */
export const CHART_MARGIN: Partial<ChartMargin> = {
  top: 8,
  right: 12,
  bottom: 4,
  left: 4,
};

/** Extra bottom margin an X axis title needs below the tick labels. */
const X_AXIS_TITLE_SPACE_PX = 28;

/** Extra left margin a rotated Y axis title needs beside the tick labels. */
const Y_AXIS_TITLE_SPACE_PX = 24;

/**
 * Plot margin adjusted for the axis titles a chart actually renders. Titles are
 * drawn outside the plot, so the space has to be reserved here or they clip.
 */
export function chartMargin(titles: {
  x?: string | undefined;
  y?: string | undefined;
}): Partial<ChartMargin> {
  return {
    ...CHART_MARGIN,
    bottom: (CHART_MARGIN.bottom ?? 0) + (titles.x ? X_AXIS_TITLE_SPACE_PX : 0),
    left: (CHART_MARGIN.left ?? 0) + (titles.y ? Y_AXIS_TITLE_SPACE_PX : 0),
  };
}

/**
 * One series' identity for the color scale: the stable key marks carry on their
 * `color` channel, and the palette token that key paints in.
 */
export interface ChartSeriesColor {
  key: ChartKey;
  token: ChartColorToken;
}

/**
 * An ordinal color scale over explicit series keys. The domain is passed
 * explicitly (rather than inferred from the data) so a series keeps its color
 * when other series appear, disappear, or reorder — and so tooltip
 * `sort: "color-domain"` orders rows the way the legend lists them.
 */
export function chartColorOptions(
  series: readonly ChartSeriesColor[]
): ChartColorOptions {
  return {
    scale: scaleOrdinal,
    domain: series.map((entry) => entry.key),
    range: series.map((entry) => chartSeriesColor(entry.token)),
  };
}

/** Presentation shared by both categorical X axes: no axis line, no tick stubs. */
function categoryAxisPresentation(options: {
  format?: (value: string) => string;
  title?: string | undefined;
}) {
  return {
    line: false,
    label: options.title,
    ticks: { size: 0, padding: 8, format: options.format },
    tickLabels: { thin: true },
  } as const;
}

/**
 * A banded category X axis — the interval scale bars need, with a slice of
 * padding between and outside the bands.
 */
export function categoryBandAxis(options: {
  format?: (value: string) => string;
  title?: string | undefined;
}): ChartAxisOptions<string> {
  return {
    scale: () => scaleBand<string>().paddingInner(0.2).paddingOuter(0.1),
    axis: categoryAxisPresentation(options),
  };
}

/**
 * A category X axis positioned at band centers — what lines, areas, and dots
 * need so the first and last point sit on the plot edges rather than inset.
 */
export function categoryPointAxis(options: {
  format?: (value: string) => string;
  title?: string | undefined;
}): ChartAxisOptions<string> {
  return {
    scale: scalePoint,
    axis: categoryAxisPresentation(options),
  };
}

/**
 * A continuous numeric axis. `domain` pins both ends (chart views resolve their
 * own auto-domain from the data, see `lib/charts/chart-y-domain.ts`); omitting
 * it lets the scale infer and nice-round its own bounds.
 */
export function numberValueAxis(options: {
  domain?: readonly [number, number];
  format?: (value: number) => string;
  grid?: boolean;
  ticks?: number;
  title?: string | undefined;
  /** `false` keeps the scale but draws no visible axis. */
  visible?: boolean;
}): ChartAxisOptions<number> {
  const scale =
    options.domain === undefined
      ? scaleLinear
      : scaleLinear().domain(options.domain);
  return {
    scale,
    nice: options.domain === undefined,
    grid: options.grid ?? true,
    axis:
      options.visible === false
        ? false
        : {
            line: false,
            label: options.title,
            ticks: {
              count: options.ticks,
              size: 0,
              padding: 6,
              format: options.format,
            },
            tickLabels: { thin: true },
          },
  };
}

/**
 * A continuous time X axis over epoch milliseconds. Time is carried as a number
 * (not a `Date`) because the history stores hand out epoch timestamps and a
 * linear scale over them ticks and inverts correctly for the windows the app
 * offers (a day through a year).
 */
export function timeValueAxis(options: {
  domain?: readonly [number, number];
  format: (value: number) => string;
  grid?: boolean;
  title?: string | undefined;
}): ChartAxisOptions<number> {
  return {
    scale:
      options.domain === undefined
        ? scaleLinear
        : scaleLinear().domain(options.domain),
    grid: options.grid ?? false,
    axis: {
      line: false,
      label: options.title,
      ticks: { size: 0, padding: 8, format: options.format },
      tickLabels: { thin: true },
    },
  };
}

/**
 * The smooth curve for lines and areas. Monotone (rather than a natural or
 * cardinal spline) because it never overshoots: an interpolated segment stays
 * within its endpoints' range, so a smoothed series cannot imply a value the
 * data does not contain. Pass `undefined` as a mark's `curve` for straight
 * segments — that is the library's default.
 */
export const CHART_SMOOTH_CURVE: ChartCurve = d3Curve(curveMonotoneX);

/**
 * The step curve: hold each value until the next sample, then jump. For series
 * that change discretely rather than continuously, where a sloped segment would
 * imply intermediate values that never existed.
 */
export const CHART_STEP_CURVE: ChartCurve = d3Curve(curveStepAfter);

/**
 * Y positions for `minor` evenly-spaced subdivision gridlines between each pair
 * of major ticks over `domain`. Returns nothing when no subdivisions are asked
 * for, so the caller can skip the mark entirely.
 */
export function minorGridValues(
  domain: readonly [number, number],
  tickCount: number,
  minor: number
): number[] {
  if (minor < 1) {
    return [];
  }
  const majors = scaleLinear().domain(domain).ticks(tickCount);
  const values: number[] = [];
  for (let index = 0; index < majors.length - 1; index++) {
    const start = majors[index];
    const step = (majors[index + 1] - start) / (minor + 1);
    for (let sub = 1; sub <= minor; sub++) {
      values.push(start + step * sub);
    }
  }
  return values;
}

/**
 * Path motion for a mark whose data streams: a new sample arriving shifts the
 * path sideways instead of re-morphing every vertex.
 *
 * There is no "live mode" anywhere in the chart layer, and there should not be.
 * A chart re-renders when its data changes like any other React subtree, and the
 * motion renderer diffs the two scenes — so a polling loop, a websocket, and a
 * one-shot fetch all animate through the same path. What makes a *streaming*
 * chart read correctly is only this: keyed points, so identity survives the
 * update, plus a rolling path so an append reads as the window advancing rather
 * than as every point moving at once. Without a key, appending one sample looks
 * like every sample changed value.
 *
 * `fallback: "morph"` covers the updates that are not a clean shift — a series
 * appearing, the window jumping, a backfill landing — so this is safe to hand to
 * any line or area, not just a streaming one.
 */
export const CHART_STREAM_MOTION: ChartMotionDefinition = {
  path: { update: "rolling", x: "shift", y: "reproject", fallback: "morph" },
};

export interface SessionTimeAxisOptions {
  /**
   * Intervals to give no width. Empty leaves the axis linear, so a caller never
   * branches on whether its data has closures — it passes what it detected
   * (`detectClosedPeriods`) or nothing to keep real elapsed time.
   */
  closed: readonly ClosedPeriod[];
  format: (value: number) => string;
  grid?: boolean;
  /** Every plotted timestamp; the axis domain spans them. */
  samples: readonly number[];
  title?: string | undefined;
}

export interface SessionTimeAxis {
  axis: ChartAxisOptions<number>;
  /**
   * Timestamps where the axis removed time. A chart should mark each one — a
   * compressed axis that hides its compression misstates elapsed time.
   */
  breaks: readonly number[];
}

/**
 * A time axis that gives width only to observed time, plus the seams where it
 * took width away.
 *
 * Pass the same `closed` intervals to `withClosedPeriodGaps` so the marks break
 * where the axis compresses. The two are complementary and neither is
 * sufficient alone: compression fixes the wasted width, the break fixes the
 * interpolation that would otherwise read as data.
 */
export function sessionTimeAxis(
  options: SessionTimeAxisOptions
): SessionTimeAxis {
  const observed = options.samples.filter(Number.isFinite);
  const domain: readonly [number, number] = [
    Math.min(...observed),
    Math.max(...observed),
  ];
  if (observed.length < 2 || domain[0] === domain[1]) {
    return {
      axis: timeValueAxis({ format: options.format, title: options.title }),
      breaks: [],
    };
  }
  const scale = sessionTimeScale(domain, options.closed).domain(domain);
  return {
    axis: {
      scale,
      grid: options.grid ?? false,
      axis: {
        line: false,
        label: options.title,
        ticks: { size: 0, padding: 8, format: options.format },
        tickLabels: { thin: true },
      },
    },
    breaks: scale.breaks(),
  };
}

export interface SeriesTooltipOptions<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
> {
  /** Row label for a point; defaults to the series (color group) label. */
  label?: (point: ChartPoint<TDatum, TXValue, TYValue>) => string;
  /** Tooltip heading; defaults to the formatted X value. */
  title?: (point: ChartPoint<TDatum, TXValue, TYValue>) => string;
  /**
   * The row's readout. Takes the whole point rather than a value because the
   * measured quantity is not always an axis coordinate: a polar mark's `yValue`
   * is a radius, so an arc has to read its magnitude off the datum.
   */
  value: (point: ChartPoint<TDatum, TXValue, TYValue>) => string;
}

/**
 * The tooltip every chart uses: heading from the hovered X value, then one row
 * per focused point — palette swatch, series label, formatted value. Rows come
 * out in color-scale order so they read in the same sequence as the legend.
 *
 * Rendering is the DOM tooltip extension's; it reads its surface from the
 * `--ts-chart-tooltip-*` custom properties `styles.css` maps onto the popover
 * tokens, so the tooltip matches menus and dialogs without a React portal.
 */
/**
 * A configured DOM tooltip: the extension plus the options it runs with. Named
 * so callers can read the resolved content back (tests do), which the broader
 * `ChartTooltipInput` union — which also admits a bare extension token — hides.
 */
export type SeriesTooltip<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
> = { use: ChartTooltipExtension } & ChartTooltipOptions<
  TDatum,
  TXValue,
  TYValue
>;

export function seriesTooltip<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(
  options: SeriesTooltipOptions<TDatum, TXValue, TYValue>
): SeriesTooltip<TDatum, TXValue, TYValue> {
  return {
    use: tooltip,
    anchor: "group-center",
    placement: "auto",
    sort: "color-domain",
    content: (points, context) => ({
      title: options.title
        ? options.title(points[0])
        : context.formatX(points[0].xValue),
      rows: points.map(
        (point): ChartTooltipRow => ({
          label: options.label ? options.label(point) : point.groupLabel,
          value: options.value(point),
          color: point.color,
        })
      ),
    }),
  };
}
