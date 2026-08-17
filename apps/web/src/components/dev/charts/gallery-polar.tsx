import { defineChart } from "@tanstack/charts";
import { decorative } from "@tanstack/charts/mark/decorative";
import {
  angleGrid,
  focusGroupAngle,
  type PieDatum,
  pie,
  polar,
  radialArc,
  radialArea,
  radialBarAngle,
  radialGrid,
  radialText,
} from "@tanstack/charts/polar";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { curveLinearClosed } from "d3-shape";
import type { ReactNode } from "react";

import { ChartFrame } from "@/components/charts/chart-frame.tsx";
import { ChartLegend } from "@/components/charts/chart-legend.tsx";
import {
  BROWSER_ROWS,
  BROWSER_TOTAL,
  type BrowserRow,
  DEVICE_LABELS,
  formatCount,
  RADAR_MAX,
  RADAR_MONTHS,
  RADAR_ROWS,
  type RadarRow,
} from "@/components/dev/charts/chart-gallery-data.ts";
import {
  BROWSER_SERIES,
  browserLegendItems,
  deviceLegendItems,
  GALLERY_PLOT_HEIGHT_PX,
  TWO_DEVICE_SERIES,
} from "@/components/dev/charts/gallery-series.ts";
import { chartSeriesColor } from "@/lib/charts/chart-palettes.ts";
import {
  CHART_THEME,
  chartColorOptions,
  seriesTooltip,
} from "@/lib/charts/chart-spec.ts";

/**
 * @fileoverview The gallery's polar charts — pie, donut, radar, and radial bar.
 *
 * A `polar` container brings its own angle and radius scales, so these specs
 * omit `x`/`y` entirely; the color scale is the only thing they share with the
 * Cartesian charts. Radii are declared in the radius scale's own units and
 * mapped to pixels by `radiusRatio`, which is why the numbers here are
 * fractions of one rather than pixel counts.
 */

/** The browser slices, allocated into angular intervals. */
const BROWSER_ARCS = pie(BROWSER_ROWS, { value: "visitors" });

/** Full-circle angle and unit-radius scales — the frame every pie sits in. */
const UNIT_POLAR_SCALES = {
  angle: { scale: scaleLinear().domain([0, Math.PI * 2]) },
  radius: { scale: scaleLinear().domain([0, 1]) },
} as const;

/**
 * Arc radii are pixels, not radius-scale units, so a hole has to be expressed
 * as a fraction of the plot's resolved radius rather than a literal.
 */
function holeRadius(fraction: number) {
  return (context: { radius: number }) => context.radius * fraction;
}

/**
 * Slice tooltip: the browser's name as the heading, its count as the row. An
 * arc's `yValue` is a radius, so the count comes off the allocated pie datum.
 */
function sliceTooltip() {
  return seriesTooltip<PieDatum<BrowserRow>, number, number>({
    label: () => "Visitors",
    title: (point) => point.datum.label,
    value: (point) => formatCount(point.datum.value),
  });
}

/** Radial-bar tooltip: the sweep is the value, so it reads off the row. */
function trackTooltip() {
  return seriesTooltip<BrowserRow, number, string>({
    label: () => "Visitors",
    title: (point) => point.datum.label,
    value: (point) => formatCount(point.datum.visitors),
  });
}

const PIE_SIMPLE = defineChart(
  {
    marks: [
      polar({
        ...UNIT_POLAR_SCALES,
        radiusRatio: 0.92,
        marks: [
          radialArc(BROWSER_ARCS, {
            key: "browser",
            color: "browser",
            stroke: "var(--background)",
            strokeWidth: 2,
          }),
        ],
      }),
    ],
    color: chartColorOptions(BROWSER_SERIES),
    margin: 4,
    theme: CHART_THEME,
  },
  { focus: focusGroupAngle, tooltip: sliceTooltip() }
);

const PIE_DONUT = defineChart(
  {
    marks: [
      polar({
        ...UNIT_POLAR_SCALES,
        radiusRatio: 0.92,
        marks: [
          radialArc(BROWSER_ARCS, {
            key: "browser",
            color: "browser",
            innerRadius: holeRadius(0.58),
            cornerRadius: 3,
            stroke: "var(--background)",
            strokeWidth: 2,
          }),
        ],
      }),
    ],
    color: chartColorOptions(BROWSER_SERIES),
    margin: 4,
    theme: CHART_THEME,
  },
  { focus: focusGroupAngle, tooltip: sliceTooltip() }
);

/** A centered label pair: the total above its caption, both at radius zero. */
const DONUT_CENTER_MARKS = [
  radialText([{ id: "total", angle: 0, radius: 0 }], {
    key: "id",
    angle: "angle",
    radius: "radius",
    text: () => formatCount(BROWSER_TOTAL),
    dy: -6,
    fill: "var(--foreground)",
    fontSize: 24,
    fontWeight: 700,
  }),
  radialText([{ id: "caption", angle: 0, radius: 0 }], {
    key: "id",
    angle: "angle",
    radius: "radius",
    text: () => "Visitors",
    dy: 14,
    fill: "var(--muted-foreground)",
    fontSize: 11,
  }),
];

const PIE_DONUT_TEXT = defineChart(
  {
    marks: [
      polar({
        ...UNIT_POLAR_SCALES,
        radiusRatio: 0.92,
        marks: [
          radialArc(BROWSER_ARCS, {
            key: "browser",
            color: "browser",
            innerRadius: holeRadius(0.62),
            stroke: "var(--background)",
            strokeWidth: 2,
          }),
        ],
      }),
      // Decorative: the center labels paint but own no chart points, so the
      // slice datum stays the only thing focus and the tooltip can resolve.
      decorative(polar({ ...UNIT_POLAR_SCALES, marks: DONUT_CENTER_MARKS })),
    ],
    color: chartColorOptions(BROWSER_SERIES),
    margin: 4,
    theme: CHART_THEME,
  },
  { focus: focusGroupAngle, tooltip: sliceTooltip() }
);

/** Four evenly-spaced rings under the radar's spokes. */
const RADAR_GRID_VALUES = Array.from({ length: 4 }, (_unused, index) =>
  Math.round((RADAR_MAX * (index + 1)) / 4)
);

const RADAR_MULTIPLE = defineChart(
  {
    marks: [
      polar({
        radiusRatio: 0.78,
        angle: { scale: scalePoint<string>().domain(RADAR_MONTHS), wrap: true },
        radius: { scale: scaleLinear().domain([0, RADAR_MAX]) },
        guides: [
          radialGrid({
            values: RADAR_GRID_VALUES,
            shape: "polygon",
            stroke: "var(--border)",
          }),
          angleGrid({
            values: [...RADAR_MONTHS],
            labels: true,
            labelOffset: 10,
            labelFill: "var(--muted-foreground)",
            labelFontSize: 11,
            stroke: "var(--border)",
          }),
        ],
        // One closed area per series. Overlapping translucent fills muddy each
        // other, so the fills stay faint and the solid outlines do the reading.
        marks: TWO_DEVICE_SERIES.map((series) =>
          radialArea(
            RADAR_ROWS.filter((row) => row.series === series.key),
            {
              angle: "month",
              radius: "value",
              key: "month",
              color: "series",
              curve: curveLinearClosed,
              fillOpacity: 0.18,
              stroke: chartSeriesColor(series.token),
              strokeWidth: 2,
            }
          )
        ),
      }),
    ],
    color: chartColorOptions(TWO_DEVICE_SERIES),
    margin: 8,
    theme: CHART_THEME,
  },
  {
    focus: focusGroupAngle,
    tooltip: seriesTooltip<RadarRow, string, number>({
      label: (point) => DEVICE_LABELS[point.datum.series],
      value: (point) => formatCount(point.datum.value),
    }),
  }
);

/** Concentric tracks, one per browser, each swept to its share of the peak. */
const RADIAL_MAX = Math.max(...BROWSER_ROWS.map((row) => row.visitors));

const RADIAL_STACKED = defineChart(
  {
    marks: [
      polar({
        startAngle: 0,
        endAngle: (Math.PI * 3) / 2,
        angle: { scale: scaleLinear().domain([0, RADIAL_MAX]) },
        radius: {
          scale: scaleBand<string>().domain(
            BROWSER_ROWS.map((row) => row.browser)
          ),
          // Tracks are rings, so the innermost band starts away from the center
          // instead of filling it as a wedge.
          range: [holeRadius(0.35), (context) => context.radius],
        },
        radiusRatio: 0.95,
        marks: [
          radialBarAngle(BROWSER_ROWS, {
            angle: "visitors",
            radius: "browser",
            key: "browser",
            color: "browser",
            cornerRadius: "full",
          }),
        ],
      }),
    ],
    color: chartColorOptions(BROWSER_SERIES),
    margin: 4,
    theme: CHART_THEME,
  },
  { focus: focusGroupAngle, tooltip: trackTooltip() }
);

/** Every polar variant, in the order the gallery grid lists them. */
export const POLAR_GALLERY: readonly {
  chart: ReactNode;
  description: string;
  title: string;
}[] = [
  {
    title: "Pie",
    description: "Parts of a whole, hairlined in the page color.",
    chart: (
      <ChartFrame
        ariaLabel="Pie chart"
        definition={PIE_SIMPLE}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={browserLegendItems()} />}
      />
    ),
  },
  {
    title: "Pie · donut",
    description: "Same slices, hollow center, rounded arc ends.",
    chart: (
      <ChartFrame
        ariaLabel="Donut chart"
        definition={PIE_DONUT}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={browserLegendItems()} />}
      />
    ),
  },
  {
    title: "Pie · donut with total",
    description: "The hollow center carries the aggregate the slices sum to.",
    chart: (
      <ChartFrame
        ariaLabel="Donut chart with total"
        definition={PIE_DONUT_TEXT}
        height={GALLERY_PLOT_HEIGHT_PX}
      />
    ),
  },
  {
    title: "Radar",
    description: "Two series over a cyclic axis, on a polygonal grid.",
    chart: (
      <ChartFrame
        ariaLabel="Radar chart"
        definition={RADAR_MULTIPLE}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={deviceLegendItems(TWO_DEVICE_SERIES)} />}
      />
    ),
  },
  {
    title: "Radial bars",
    description: "One track per category, swept to its share of the peak.",
    chart: (
      <ChartFrame
        ariaLabel="Radial bar chart"
        definition={RADIAL_STACKED}
        height={GALLERY_PLOT_HEIGHT_PX}
        legend={<ChartLegend items={browserLegendItems()} />}
      />
    ),
  },
];
