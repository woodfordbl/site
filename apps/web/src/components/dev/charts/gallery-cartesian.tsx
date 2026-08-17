import {
  areaY,
  barX,
  barY,
  defineChart,
  dot,
  group,
  lineY,
  ruleY,
  stack,
  text,
} from "@tanstack/charts";
import type { ReactNode } from "react";

import { ChartFrame } from "@/components/charts/chart-frame.tsx";
import { ChartLegend } from "@/components/charts/chart-legend.tsx";
import {
  BROWSER_ROWS,
  type BrowserRow,
  DESKTOP_ROWS,
  DEVICE_LABELS,
  DEVICE_ROWS,
  type DeviceRow,
  formatCount,
  NET_CHANGE_ROWS,
  type NetChangeRow,
  TWO_DEVICE_ROWS,
} from "@/components/dev/charts/chart-gallery-data.ts";
import {
  BROWSER_SERIES,
  browserLabel,
  browserLegendItems,
  DEVICE_SERIES,
  deviceLegendItems,
  GALLERY_PLOT_HEIGHT_PX,
  TWO_DEVICE_SERIES,
} from "@/components/dev/charts/gallery-series.ts";
import {
  CHART_SMOOTH_CURVE,
  CHART_STEP_CURVE,
  CHART_THEME,
  categoryBandAxis,
  categoryPointAxis,
  chartColorOptions,
  numberValueAxis,
  seriesTooltip,
} from "@/lib/charts/chart-spec.ts";

/**
 * @fileoverview The gallery's Cartesian charts — area, bar, and line, in the
 * variants the app's chart options can produce.
 *
 * Each export is a bare `<ChartFrame>`: no card, no heading, no palette. The
 * gallery grid supplies all three, and the palette comes from the toggle it
 * wraps everything in, so every chart here demonstrates the *mark* and nothing
 * else. Definitions are module-level constants where the data is fixed —
 * nothing in the gallery is derived from props, so there is nothing to memoize.
 */

/** Channel mapping shared by every month-over-device Cartesian mark. */
const DEVICE_CHANNELS = {
  x: "month",
  y: "value",
  z: "series",
  color: "series",
} as const;

/** The tooltip every device chart uses: series label plus a grouped count. */
function deviceTooltip() {
  return seriesTooltip<DeviceRow, string, number>({
    label: (point) => DEVICE_LABELS[point.datum.series],
    value: (point) => formatCount(point.yValue),
  });
}

const AREA_DEFAULT = defineChart(
  {
    marks: [
      areaY(DESKTOP_ROWS, {
        ...DEVICE_CHANNELS,
        curve: CHART_SMOOTH_CURVE,
        fillOpacity: 0.3,
        strokeWidth: 2,
      }),
    ],
    x: categoryPointAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions(DEVICE_SERIES.slice(0, 1)),
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

const AREA_STACKED = defineChart(
  {
    marks: [
      areaY(DEVICE_ROWS, {
        ...DEVICE_CHANNELS,
        curve: CHART_SMOOTH_CURVE,
        fillOpacity: 0.5,
        layout: stack({ order: DEVICE_SERIES.map((entry) => entry.key) }),
        strokeWidth: 1,
      }),
    ],
    x: categoryPointAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions(DEVICE_SERIES),
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

const AREA_STEP = defineChart(
  {
    marks: [
      areaY(TWO_DEVICE_ROWS, {
        ...DEVICE_CHANNELS,
        curve: CHART_STEP_CURVE,
        fillOpacity: 0.3,
        strokeWidth: 2,
      }),
    ],
    x: categoryPointAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions(TWO_DEVICE_SERIES),
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

const BAR_DEFAULT = defineChart(
  {
    marks: [
      barY(DESKTOP_ROWS, { ...DEVICE_CHANNELS, key: "month", radius: 4 }),
    ],
    x: categoryBandAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions(DEVICE_SERIES.slice(0, 1)),
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

const BAR_GROUPED = defineChart(
  {
    marks: [
      barY(TWO_DEVICE_ROWS, {
        ...DEVICE_CHANNELS,
        key: (row: DeviceRow) => `${row.month}:${row.series}`,
        layout: group({ padding: 0.15 }),
        radius: 3,
      }),
    ],
    x: categoryBandAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions(TWO_DEVICE_SERIES),
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

const BAR_STACKED = defineChart(
  {
    marks: [
      barY(DEVICE_ROWS, {
        ...DEVICE_CHANNELS,
        key: (row: DeviceRow) => `${row.month}:${row.series}`,
        layout: stack({ order: DEVICE_SERIES.map((entry) => entry.key) }),
        radius: 4,
      }),
    ],
    x: categoryBandAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions(DEVICE_SERIES),
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

/** Browsers ranked left to right: value on X, category bands on Y. */
const BAR_HORIZONTAL = defineChart(
  {
    marks: [
      barX(BROWSER_ROWS, {
        x: "visitors",
        y: "browser",
        color: "browser",
        key: "browser",
        radius: 4,
      }),
    ],
    x: numberValueAxis({ format: formatCount, grid: false, visible: false }),
    y: categoryBandAxis({ format: browserLabel }),
    color: chartColorOptions(BROWSER_SERIES),
    margin: { left: 64 },
    theme: CHART_THEME,
  },
  {
    focus: "nearest",
    // Horizontal bars put the measured value on X, so the tooltip reads the
    // point's X value and the Y value is the category.
    tooltip: seriesTooltip<BrowserRow, number, string>({
      label: (point) => point.datum.label,
      title: () => "Visitors",
      value: (point) => formatCount(point.xValue),
    }),
  }
);

/** Signed monthly change: the value axis spans zero, so bars diverge from it. */
const BAR_NEGATIVE = defineChart(
  {
    marks: [
      // The zero line is the whole point of a diverging chart — without it the
      // bars read as floating rectangles.
      ruleY([0], { stroke: "var(--muted-foreground)", strokeOpacity: 0.5 }),
      barY(NET_CHANGE_ROWS, {
        x: "month",
        y: "value",
        key: "month",
        // Sign, not series, picks the color — gains and losses read apart.
        color: (row: NetChangeRow) => (row.value >= 0 ? "gain" : "loss"),
        radius: 3,
      }),
    ],
    x: categoryBandAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions([
      { key: "gain", token: 3 },
      { key: "loss", token: 4 },
    ]),
    theme: CHART_THEME,
  },
  {
    focus: "nearest",
    tooltip: seriesTooltip<NetChangeRow, string, number>({
      label: (point) => (point.datum.value >= 0 ? "Gain" : "Loss"),
      value: (point) => formatCount(point.yValue),
    }),
  }
);

/** Bars with their value printed above each one, so no axis is needed. */
const BAR_LABELLED = defineChart(
  {
    marks: [
      barY(DESKTOP_ROWS, { ...DEVICE_CHANNELS, key: "month", radius: 4 }),
      text(DESKTOP_ROWS, {
        x: "month",
        y: "value",
        key: "month",
        text: "value",
        anchor: "middle",
        dy: -8,
        fill: "var(--muted-foreground)",
        fontSize: 10,
      }),
    ],
    x: categoryBandAxis({}),
    y: numberValueAxis({ format: formatCount, grid: false, visible: false }),
    color: chartColorOptions(DEVICE_SERIES.slice(0, 1)),
    margin: { top: 18 },
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

const LINE_DEFAULT = defineChart(
  {
    marks: [
      lineY(DESKTOP_ROWS, {
        ...DEVICE_CHANNELS,
        curve: CHART_SMOOTH_CURVE,
        strokeWidth: 2,
      }),
    ],
    x: categoryPointAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions(DEVICE_SERIES.slice(0, 1)),
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

const LINE_MULTIPLE = defineChart(
  {
    marks: [
      lineY(DEVICE_ROWS, {
        ...DEVICE_CHANNELS,
        curve: CHART_SMOOTH_CURVE,
        strokeWidth: 2,
      }),
    ],
    x: categoryPointAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions(DEVICE_SERIES),
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

/** A line with its samples marked, so individual readings stay identifiable. */
const LINE_DOTS = defineChart(
  {
    marks: [
      lineY(TWO_DEVICE_ROWS, {
        ...DEVICE_CHANNELS,
        curve: CHART_SMOOTH_CURVE,
        strokeWidth: 2,
      }),
      dot(TWO_DEVICE_ROWS, {
        ...DEVICE_CHANNELS,
        key: (row: DeviceRow) => `${row.month}:${row.series}`,
        r: 3,
        stroke: "var(--background)",
        strokeWidth: 1.5,
      }),
    ],
    x: categoryPointAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions(TWO_DEVICE_SERIES),
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

const LINE_STEP = defineChart(
  {
    marks: [
      lineY(DESKTOP_ROWS, {
        ...DEVICE_CHANNELS,
        curve: CHART_STEP_CURVE,
        strokeWidth: 2,
      }),
    ],
    x: categoryPointAxis({}),
    y: numberValueAxis({ format: formatCount, visible: false }),
    color: chartColorOptions(DEVICE_SERIES.slice(0, 1)),
    theme: CHART_THEME,
  },
  { focus: "group-x", tooltip: deviceTooltip() }
);

/** Every Cartesian variant, in the order the gallery grid lists them. */
export const CARTESIAN_GALLERY: readonly {
  chart: ReactNode;
  description: string;
  title: string;
}[] = [
  {
    title: "Area",
    description: "Single series, monotone curve, filled to the baseline.",
    chart: (
      <ChartFrame
        ariaLabel="Area chart"
        definition={AREA_DEFAULT}
        height={GALLERY_PLOT_HEIGHT_PX}
      />
    ),
  },
  {
    title: "Area · stacked",
    description: "Three series summed; each band is its own contribution.",
    chart: (
      <ChartFrame
        ariaLabel="Stacked area chart"
        definition={AREA_STACKED}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={deviceLegendItems(DEVICE_SERIES)} />}
      />
    ),
  },
  {
    title: "Area · step",
    description: "Values hold until the next sample instead of sloping.",
    chart: (
      <ChartFrame
        ariaLabel="Step area chart"
        definition={AREA_STEP}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={deviceLegendItems(TWO_DEVICE_SERIES)} />}
      />
    ),
  },
  {
    title: "Bar",
    description: "One bar per category, rounded at the data end.",
    chart: (
      <ChartFrame
        ariaLabel="Bar chart"
        definition={BAR_DEFAULT}
        height={GALLERY_PLOT_HEIGHT_PX}
      />
    ),
  },
  {
    title: "Bar · grouped",
    description: "Series side by side inside each category band.",
    chart: (
      <ChartFrame
        ariaLabel="Grouped bar chart"
        definition={BAR_GROUPED}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={deviceLegendItems(TWO_DEVICE_SERIES)} />}
      />
    ),
  },
  {
    title: "Bar · stacked",
    description: "Series share a band; the stack reads as the total.",
    chart: (
      <ChartFrame
        ariaLabel="Stacked bar chart"
        definition={BAR_STACKED}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={deviceLegendItems(DEVICE_SERIES)} />}
      />
    ),
  },
  {
    title: "Bar · horizontal",
    description: "Value on X — room for long category labels.",
    chart: (
      <ChartFrame
        ariaLabel="Horizontal bar chart"
        definition={BAR_HORIZONTAL}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={browserLegendItems()} />}
      />
    ),
  },
  {
    title: "Bar · diverging",
    description: "Signed values across a zero baseline, colored by sign.",
    chart: (
      <ChartFrame
        ariaLabel="Diverging bar chart"
        definition={BAR_NEGATIVE}
        height={GALLERY_PLOT_HEIGHT_PX}
      />
    ),
  },
  {
    title: "Bar · labelled",
    description: "Values printed on the marks, so the axis can go away.",
    chart: (
      <ChartFrame
        ariaLabel="Labelled bar chart"
        definition={BAR_LABELLED}
        height={GALLERY_PLOT_HEIGHT_PX}
      />
    ),
  },
  {
    title: "Line",
    description: "Single series, monotone curve, no fill.",
    chart: (
      <ChartFrame
        ariaLabel="Line chart"
        definition={LINE_DEFAULT}
        height={GALLERY_PLOT_HEIGHT_PX}
      />
    ),
  },
  {
    title: "Line · multiple",
    description: "Three series on one value axis.",
    chart: (
      <ChartFrame
        ariaLabel="Multi-series line chart"
        definition={LINE_MULTIPLE}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={deviceLegendItems(DEVICE_SERIES)} />}
      />
    ),
  },
  {
    title: "Line · dots",
    description: "Samples marked, so individual readings stay identifiable.",
    chart: (
      <ChartFrame
        ariaLabel="Line chart with dots"
        definition={LINE_DOTS}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={deviceLegendItems(TWO_DEVICE_SERIES)} />}
      />
    ),
  },
  {
    title: "Line · step",
    description: "Discrete changes, held between samples.",
    chart: (
      <ChartFrame
        ariaLabel="Step line chart"
        definition={LINE_STEP}
        height={GALLERY_PLOT_HEIGHT_PX}
      />
    ),
  },
];
