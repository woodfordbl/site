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
  legendAlign?: "left" | "center" | "right";
  mark: CartesianMark;
  /** Palette override for the seed-resolution scope. */
  palette?: ChartPaletteId;
  showLegend?: boolean;
  showTooltip?: boolean;
  stacked?: boolean;
  /** X-axis field key on each row. */
  xKey: string;
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
  legendAlign = "right",
  showTooltip = true,
  palette,
  className,
  animate = true,
  bloom = "off",
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
  const legend = showLegend ? <Legend align={legendAlign} isClickable /> : null;
  const tooltip = showTooltip ? <Tooltip labelKey={xKey} /> : null;

  const series = keys.map((key) => {
    if (mark === "bar") {
      return <Bar dataKey={key} isClickable key={key} variant="gradient" />;
    }
    if (mark === "line") {
      return <Line dataKey={key} isClickable key={key} variant="gradient" />;
    }
    return <Area dataKey={key} isClickable key={key} variant="gradient" />;
  });

  const inner = (
    <>
      <Grid />
      <XAxis dataKey={xKey} />
      <YAxis />
      {legend}
      {tooltip}
      {series}
    </>
  );

  const chartProps = {
    animate,
    bloom,
    config: dkConfig,
    data,
    stackType,
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
      className={cn("h-full w-full", className)}
      data-chart-palette={palette ?? workspacePalette}
      ref={ref}
    >
      {chart}
    </div>
  );
}
