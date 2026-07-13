"use client";

import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  type ChartConfig as DitherChartConfig,
  Grid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "@/components/charts/dither-kit/index.ts";
import {
  type Seed,
  seedFromRgb,
} from "@/components/charts/dither-kit/palette.ts";
import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import type { ChartConfig } from "@/components/ui/chart.tsx";
import type { ChartPaletteId } from "@/lib/charts/chart-palettes.ts";
import { cssColorToRgb } from "@/lib/charts/dither-texture.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Resolves each series' workspace colour (`config[key].color`, a `var(--chart-N)`
 * token) to a dither-kit RGB {@link Seed}, re-resolving when the theme or palette
 * changes. Attach `ref` to an element inside the palette scope. Uses a layout
 * effect so seeds are ready before paint (no grey flash on first render).
 */
function useDitherKitSeeds(config: ChartConfig): {
  ref: React.RefObject<HTMLDivElement | null>;
  seeds: Record<string, Seed>;
} {
  const { chartPalette, resolvedTheme } = useSiteAppearance();
  const ref = useRef<HTMLDivElement | null>(null);
  const [seeds, setSeeds] = useState<Record<string, Seed>>({});

  // Signature of the (key → colour) pairs so we only re-resolve on real changes.
  const sig = useMemo(
    () =>
      Object.entries(config)
        .map(([key, item]) => `${key}:${item.color ?? ""}`)
        .join("|"),
    [config]
  );

  const regenerate = useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const next: Record<string, Seed> = {};
    for (const pair of sig.split("|").filter(Boolean)) {
      const [key, color] = pair.split(":");
      const rgb = cssColorToRgb(el, color || `var(--color-${key})`);
      if (rgb) {
        next[key] = seedFromRgb(rgb);
      }
    }
    setSeeds(next);
  }, [sig]);

  // Re-resolve before paint, and whenever theme/palette shift the token values.
  // biome-ignore lint/correctness/useExhaustiveDependencies: theme/palette are intentional re-resolve triggers
  useLayoutEffect(() => {
    regenerate();
  }, [regenerate, resolvedTheme, chartPalette]);

  return { ref, seeds };
}

type CartesianMark = "area" | "bar" | "line";

/** Dither textures cycled across overlapping area series to tell them apart. */
const AREA_VARIANT_CYCLE = ["gradient", "hatched"] as const;

interface DitherKitCartesianProps {
  /** Static charts animate + show sparkles; live charts should pass false. */
  animate?: boolean;
  /** Bloom preset; "off" by default. */
  bloom?: "off" | "low" | "high" | "aura";
  className?: string;
  /** Our chart config: `{ key: { label, color: "var(--chart-N)" } }`. */
  config: ChartConfig;
  /** Rows keyed by the series keys plus the x field. */
  data: Record<string, number | string | null>[];
  /** Area fill fades to the baseline (true) or is a flat solid fill (false). */
  gradient?: boolean;
  /** Number of minor horizontal grid lines between each major line. */
  gridMinor?: number;
  /** Draw vertical grid lines (one per category). */
  gridVertical?: boolean;
  /** Cap vertical grid lines to ~this many (for dense time series). */
  gridVerticalMaxTicks?: number;
  legendPosition?: "top" | "bottom" | "right";
  mark: CartesianMark;
  /** Palette override for the seed-resolution scope. */
  palette?: ChartPaletteId;
  showGrid?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  /** Monotone curve instead of the pixel staircase. */
  smooth?: boolean;
  stacked?: boolean;
  /** Major horizontal grid lines / Y ticks (absent = auto ≈ 4). */
  tickCount?: number;
  /** Formats the tooltip heading (e.g. a raw timestamp → readable date/time). */
  tooltipLabelFormatter?: (rawLabel: string) => string;
  /** Formats each tooltip value (field/percent format). */
  tooltipValueFormatter?: (value: number, name: string) => string;
  /** Optional axis titles rendered around the plot. */
  xAxisTitle?: string;
  /** X-axis field key on each row. */
  xKey: string;
  /** Formats x tick values (e.g. timestamps for a time-series). */
  xTickFormatter?: (value: unknown, index: number) => string;
  yAxisTitle?: string;
  /** Fixed Y-axis bounds (absent = auto from data). */
  yMax?: number;
  yMin?: number;
}

/** Map our legend placement to the engine's (align + top/bottom) legend props. */
function legendProps(position: "top" | "bottom" | "right"): {
  align: "left" | "center" | "right";
  position: "top" | "bottom";
} {
  if (position === "bottom") {
    return { align: "center", position: "bottom" };
  }
  if (position === "right") {
    return { align: "right", position: "top" };
  }
  return { align: "center", position: "top" };
}

/**
 * Reserve space for the legend so it never collides with the axis ticks: a
 * top/right legend pushes the plot down; a bottom legend lifts the x labels.
 */
function legendMarginFor(
  showLegend: boolean,
  position: "top" | "bottom" | "right"
): { top?: number; bottom?: number } | undefined {
  if (!showLegend) {
    return;
  }
  return position === "bottom" ? { bottom: 44 } : { top: 26 };
}

/**
 * Renders our chart data through the dither-kit canvas engine — the "dithered"
 * counterpart to the Recharts renderer, fed by the same `buildChartData`
 * output. Series colours come from the workspace palette (resolved to seeds).
 */

export function DitherKitCartesian({
  config,
  data,
  mark,
  xKey,
  stacked = false,
  showLegend = false,
  legendPosition = "right",
  showTooltip = true,
  showGrid = true,
  gridVertical = false,
  gridVerticalMaxTicks,
  gridMinor = 0,
  tickCount,
  gradient = true,
  smooth = false,
  yMin,
  yMax,
  xAxisTitle,
  yAxisTitle,
  palette,
  className,
  animate = true,
  bloom = "off",
  xTickFormatter,
  tooltipLabelFormatter,
  tooltipValueFormatter,
}: DitherKitCartesianProps): ReactNode {
  const { chartPalette: workspacePalette } = useSiteAppearance();
  const { ref, seeds } = useDitherKitSeeds(config);
  const keys = Object.keys(config);

  // Build dither-kit config once seeds are resolved.
  const dkConfig = useMemo<DitherChartConfig>(() => {
    const out: DitherChartConfig = {};
    for (const key of keys) {
      out[key] = { label: String(config[key]?.label ?? key), seed: seeds[key] };
    }
    return out;
  }, [keys, config, seeds]);

  const stackType = stacked ? ("stacked" as const) : ("default" as const);
  const legend = showLegend ? (
    <Legend {...legendProps(legendPosition)} isClickable key="legend" />
  ) : null;
  const tooltip = showTooltip ? (
    <Tooltip
      key="tooltip"
      labelFormatter={tooltipLabelFormatter}
      labelKey={xKey}
      valueFormatter={tooltipValueFormatter}
    />
  ) : null;
  // Overlapping (non-stacked) area series get distinct dither textures on top of
  // their colour — gradient / hatched — so meshed layers read apart instead of
  // blending into one muddy fill. Stacked or single-series keep the plain
  // gradient; gradient-off flattens every fill to solid.
  const overlappingAreas = mark === "area" && !stacked && keys.length > 1;
  const areaVariantAt = (index: number) => {
    if (!gradient) {
      return "solid" as const;
    }
    if (overlappingAreas) {
      return AREA_VARIANT_CYCLE[index % AREA_VARIANT_CYCLE.length];
    }
    return "gradient" as const;
  };

  const series = keys.map((key, index) => {
    if (mark === "bar") {
      return <Bar dataKey={key} isClickable key={key} variant="gradient" />;
    }
    if (mark === "line") {
      return <Line dataKey={key} isClickable key={key} variant="gradient" />;
    }
    return (
      <Area
        dataKey={key}
        isClickable
        key={key}
        variant={areaVariantAt(index)}
      />
    );
  });

  // Pass the composed parts as a keyed array — NOT a fragment. CartesianRoot
  // reads each child's `chartLayer` to route it (grid → behind the canvas, axes
  // → front SVG, legend/tooltip → DOM overlay). A wrapping fragment would hide
  // those per-child layers, dropping the DOM legend into the SVG (zero-size).
  const inner: ReactNode[] = [
    showGrid ? (
      <Grid
        count={tickCount ?? 4}
        key="grid"
        minorCount={gridMinor}
        vertical={gridVertical}
        verticalMaxTicks={gridVerticalMaxTicks}
      />
    ) : null,
    <XAxis dataKey={xKey} key="x-axis" tickFormatter={xTickFormatter} />,
    <YAxis key="y-axis" tickCount={tickCount ?? 4} />,
    legend,
    tooltip,
    ...series,
  ];

  const legendMargins = legendMarginFor(showLegend, legendPosition);

  const chartProps = {
    animate,
    bloom,
    config: dkConfig,
    data,
    margins: legendMargins,
    smooth,
    stackType,
    yMax,
    yMin,
  };

  let chart: ReactNode;
  if (mark === "bar") {
    chart = <BarChart {...chartProps}>{inner}</BarChart>;
  } else if (mark === "line") {
    chart = <LineChart {...chartProps}>{inner}</LineChart>;
  } else {
    chart = <AreaChart {...chartProps}>{inner}</AreaChart>;
  }

  return (
    <div
      className={cn("flex h-full w-full flex-col", className)}
      data-chart-palette={palette ?? workspacePalette}
      ref={ref}
    >
      <div className="flex min-h-0 flex-1">
        {yAxisTitle ? (
          <div className="flex w-5 shrink-0 items-center justify-center">
            <span className="whitespace-nowrap font-medium text-[11px] text-muted-foreground [transform:rotate(180deg)] [writing-mode:vertical-rl]">
              {yAxisTitle}
            </span>
          </div>
        ) : null}
        <div className="min-w-0 flex-1">{chart}</div>
      </div>
      {xAxisTitle ? (
        <div className="pt-1 text-center font-medium text-[11px] text-muted-foreground">
          {xAxisTitle}
        </div>
      ) : null}
    </div>
  );
}
