import { defineChart, lineY, ruleX } from "@tanstack/charts";
import type { ReactNode } from "react";

import { ChartFrame } from "@/components/charts/chart-frame.tsx";
import {
  formatCount,
  SESSION_ROWS,
  type SessionRow,
} from "@/components/dev/charts/chart-gallery-data.ts";
import {
  DEVICE_SERIES,
  GALLERY_PLOT_HEIGHT_PX,
} from "@/components/dev/charts/gallery-series.ts";
import {
  CHART_SMOOTH_CURVE,
  CHART_STREAM_MOTION,
  CHART_THEME,
  chartColorOptions,
  numberValueAxis,
  seriesTooltip,
  sessionTimeAxis,
} from "@/lib/charts/chart-spec.ts";
import {
  detectClosedPeriods,
  withClosedPeriodGaps,
} from "@/lib/charts/session-time-scale.ts";

/**
 * @fileoverview The gallery's time-axis charts, shown as a pair: the same
 * weekday samples with closed periods collapsed and with real elapsed time kept.
 *
 * The pair is the point. Side by side it is obvious what the collapse buys — two
 * trading days at equal width, comparable to each other — and what it costs: the
 * dashed seam is the only remaining evidence of how much time passed. A reviewer
 * can see both readings and judge which one a given chart wants.
 */

const TIME_CHANNELS = {
  x: "t",
  y: "v",
  z: "series",
  color: "series",
  key: (row: SessionRow) => `${row.series}:${row.t}`,
} as const;

const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
});

const TOOLTIP_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

const SERIES = DEVICE_SERIES.slice(0, 1);

/** Builds the definition for one reading of the same samples. */
function sessionChart(collapse: boolean) {
  const closed = detectClosedPeriods(SESSION_ROWS.map((row) => row.t));
  const time = sessionTimeAxis({
    closed: collapse ? closed : [],
    format: (value) => TIME_FORMAT.format(value),
    samples: SESSION_ROWS.map((row) => row.t),
  });
  // Both readings break the line across the closure: compression changes how
  // much width the gap gets, not whether interpolating across it would lie.
  const rows = withClosedPeriodGaps(SESSION_ROWS, closed);
  return defineChart(
    {
      marks: [
        ruleX(time.breaks, {
          stroke: "var(--border)",
          strokeDasharray: "3 3",
        }),
        lineY(rows, {
          ...TIME_CHANNELS,
          curve: CHART_SMOOTH_CURVE,
          motion: CHART_STREAM_MOTION,
          strokeWidth: 2,
        }),
      ],
      x: time.axis,
      y: numberValueAxis({ format: formatCount, ticks: 4 }),
      color: chartColorOptions(SERIES),
      theme: CHART_THEME,
    },
    {
      focus: "group-x",
      tooltip: seriesTooltip<SessionRow, number, number>({
        label: () => "Price",
        title: (point) => TOOLTIP_FORMAT.format(point.xValue),
        value: (point) => formatCount(point.yValue),
      }),
    }
  );
}

const SESSIONS_COLLAPSED = sessionChart(true);
const SESSIONS_KEPT = sessionChart(false);

/** Hours of observed time in the fixture, for the descriptions below. */
const OPEN_HOURS = SESSION_ROWS.length;

/** The time-axis pair, in the order the gallery grid lists them. */
export const TIME_GALLERY: readonly {
  chart: ReactNode;
  description: string;
  title: string;
}[] = [
  {
    title: "Time · closed periods skipped",
    description: `Both sessions at equal width, the line broken across the closure. ${String(OPEN_HOURS)} observed hours, no dead space.`,
    chart: (
      <ChartFrame
        ariaLabel="Time series with closed periods collapsed"
        definition={SESSIONS_COLLAPSED}
        height={GALLERY_PLOT_HEIGHT_PX}
      />
    ),
  },
  {
    title: "Time · real elapsed time",
    description:
      "The same samples and the same break, on a plain linear axis. Most of the width is a weekend nobody traded through.",
    chart: (
      <ChartFrame
        ariaLabel="Time series with real elapsed time"
        definition={SESSIONS_KEPT}
        height={GALLERY_PLOT_HEIGHT_PX}
      />
    ),
  },
];
