import type { ChartValue, DomChartDefinition } from "@tanstack/charts";
import { motion } from "@tanstack/charts/motion";
import { Chart } from "@tanstack/charts/react/core";
import type { ReactNode } from "react";

import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import type { ChartPaletteId } from "@/lib/charts/chart-palettes.ts";
import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview `ChartFrame` — the one place a TanStack Charts definition
 * becomes DOM in this app.
 *
 * The frame owns three things the chart definition deliberately does not:
 *
 * - **Palette scope.** It stamps `data-chart-palette`, which is what resolves
 *   the `var(--chart-N)` references a definition's color range is built from.
 *   A local `palette` prop overrides the workspace default (Settings →
 *   Appearance); nothing else in the chart pipeline knows about palettes.
 * - **Size.** The renderer observes its container's *width* only, so height is
 *   a number, never a CSS class — a chart laid out purely in CSS would render
 *   its scene at the 320px fallback and disagree with its box.
 * - **Legend placement.** Legends are React (see `chart-legend.tsx`) rather
 *   than scene nodes, so they can sit beside the plot and inherit text styles.
 */

/**
 * The shared SVG renderer. One instance serves every chart: `mount` builds a
 * fresh motion driver per container, and the driver snaps instead of animating
 * when the user prefers reduced motion.
 */
const chartRenderer = motion({
  initial: true,
  transition: { type: "spring", stiffness: 170, damping: 18, mass: 1 },
});

/** Where a chart's legend sits relative to the plot. */
export type ChartLegendPosition = "top" | "bottom" | "right";

export interface ChartFrameProps<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
> {
  /** Accessible name for the plot; required by the renderer. */
  ariaLabel: string;
  className?: string;
  definition: DomChartDefinition<TDatum, TXValue, TYValue>;
  /** Plot height in pixels. Width tracks the container. */
  height: number;
  legend?: ReactNode;
  legendPosition?: ChartLegendPosition;
  /** Palette override; omitted inherits the workspace default. */
  palette?: ChartPaletteId;
}

export function ChartFrame<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>({
  ariaLabel,
  className,
  definition,
  height,
  legend,
  legendPosition = "bottom",
  palette,
}: ChartFrameProps<TDatum, TXValue, TYValue>): ReactNode {
  const { chartPalette } = useSiteAppearance();
  const beside = legendPosition === "right";

  return (
    <div
      className={cn(
        "flex min-w-0 text-xs",
        beside ? "flex-row items-center gap-4" : "flex-col",
        legendPosition === "top" && "flex-col-reverse",
        className
      )}
      data-chart-palette={palette ?? chartPalette}
      data-slot="chart"
    >
      <div className="min-w-0 flex-1">
        <Chart
          ariaLabel={ariaLabel}
          definition={definition}
          height={height}
          renderer={chartRenderer}
        />
      </div>
      {legend}
    </div>
  );
}

/**
 * Palette scope for visuals that are not TanStack charts — the CSS bar meters
 * and swatch rows in the analytics panels — so they resolve the same
 * `--chart-N` tokens as the charts beside them.
 */
export function ChartPaletteScope({
  children,
  className,
  palette,
}: {
  children: ReactNode;
  className?: string;
  palette?: ChartPaletteId;
}): ReactNode {
  const { chartPalette } = useSiteAppearance();

  return (
    <div
      className={cn("contents", className)}
      data-chart-palette={palette ?? chartPalette}
    >
      {children}
    </div>
  );
}
