"use client";

import * as React from "react";
import type { TooltipValueType } from "recharts";
import * as RechartsPrimitive from "recharts";
import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import type { ChartPaletteId } from "@/lib/charts/chart-palettes.ts";
import {
  createDitherGradient,
  cssColorToRgb,
} from "@/lib/charts/dither-texture.ts";
import { makePixelCurve } from "@/lib/charts/pixel-curve.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Renders dithered chart shapes on the pixel grid: hard (non-antialiased) edges
 * on lines/areas/bars and nearest-neighbor scaling on the texture image, so the
 * dots and staircase read as crisp pixels. Apply to `<ChartContainer>` only when
 * dither is on — `useChartGradientDither` hands it back as `crispClassName`.
 */
const CHART_CRISP_CLASS =
  "[&_.recharts-area-area]:[shape-rendering:crispEdges] [&_.recharts-curve]:[shape-rendering:crispEdges] [&_.recharts-rectangle]:[shape-rendering:crispEdges] [&_image]:[image-rendering:pixelated]";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

const INITIAL_DIMENSION = { width: 320, height: 200 } as const;
type TooltipNameType = number | string;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>;

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  palette,
  initialDimension = INITIAL_DIMENSION,
  ref,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  /**
   * Local palette override. When omitted, the chart inherits the workspace
   * default set on `<html data-chart-palette>` (Settings → Appearance).
   */
  palette?: ChartPaletteId;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
  initialDimension?: {
    width: number;
    height: number;
  };
}) {
  const { chartPalette: workspacePalette } = useSiteAppearance();
  const resolvedPalette = palette ?? workspacePalette;
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden",
          className
        )}
        data-chart={chartId}
        data-chart-palette={resolvedPalette}
        data-slot="chart"
        ref={ref}
        {...props}
      >
        <ChartStyle config={config} id={chartId} />
        <RechartsPrimitive.ResponsiveContainer
          initialDimension={initialDimension}
        >
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/** Applies the workspace chart palette to bar lists, heatmaps, and other non-Recharts visuals. */
export function ChartPaletteScope({
  children,
  className,
  palette,
}: React.ComponentProps<"div"> & {
  /** Local override. When omitted, inherits Settings → Appearance chart palette. */
  palette?: ChartPaletteId;
}) {
  const { chartPalette: workspacePalette } = useSiteAppearance();

  return (
    <div
      className={cn("contents", className)}
      data-chart-palette={palette ?? workspacePalette}
    >
      {children}
    </div>
  );
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme ?? config.color
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ??
      itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  );
};

/**
 * Ordered (Bayer) dither textures for chart fills.
 *
 * Recharts renders SVG, so we can swap a solid `fill` for an SVG `<pattern>`
 * that tiles inside the bar/area shape and clips for free. Each pattern bakes
 * in the series' `var(--color-KEY)` token, so the texture follows light/dark
 * mode and every chart palette automatically.
 */
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

const DITHER_COVERAGE = { light: 0.25, medium: 0.5, heavy: 0.75 } as const;
export type ChartDitherDensity = keyof typeof DITHER_COVERAGE;

type ChartDitherOptions = {
  /** Pixel coverage of the dither grid. */
  density?: ChartDitherDensity;
  /** Size in px of each dither pixel (tile is 4× this). */
  pixelSize?: number;
  /** Faint solid wash behind the dots so low-coverage fills still read as the series color. */
  baseOpacity?: number;
  /**
   * Force dither on/off. When omitted, follows the workspace Chart dither
   * setting (Settings → Appearance). When disabled, `fill` returns solid colors.
   */
  enabled?: boolean;
};

function ChartDitherPattern({
  id,
  color,
  density = "medium",
  pixelSize = 2,
  baseOpacity = 0.18,
}: { id: string; color: string } & ChartDitherOptions) {
  const tile = 4 * pixelSize;
  const threshold = DITHER_COVERAGE[density] * 16;
  const cells: React.ReactNode[] = [];

  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (BAYER_4X4[y][x] < threshold) {
        cells.push(
          <rect
            fill={color}
            height={pixelSize}
            key={`${x}-${y}`}
            width={pixelSize}
            x={x * pixelSize}
            y={y * pixelSize}
          />
        );
      }
    }
  }

  return (
    <pattern height={tile} id={id} patternUnits="userSpaceOnUse" width={tile}>
      {baseOpacity > 0 && (
        <rect fill={color} height={tile} opacity={baseOpacity} width={tile} />
      )}
      {cells}
    </pattern>
  );
}

/**
 * Returns dither `<defs>` (drop them inside the Recharts chart) and a `fill`
 * helper that resolves a config key to its `url(#…)` pattern reference.
 *
 *   const dither = useChartDither(config);
 *   <BarChart>
 *     {dither.defs}
 *     <Bar dataKey="desktop" fill={dither.fill("desktop")} />
 *   </BarChart>
 */
export function useChartDither(
  config: ChartConfig,
  options?: ChartDitherOptions
) {
  const { chartDitherEnabled } = useSiteAppearance();
  const enabled = options?.enabled ?? chartDitherEnabled;
  const prefix = `dither-${React.useId().replace(/:/g, "")}`;
  const fill = React.useCallback(
    (key: string) =>
      enabled ? `url(#${prefix}-${key})` : `var(--color-${key})`,
    [prefix, enabled]
  );
  const defs = enabled ? (
    <defs>
      {Object.keys(config).map((key) => (
        <ChartDitherPattern
          baseOpacity={options?.baseOpacity}
          color={`var(--color-${key})`}
          density={options?.density}
          id={`${prefix}-${key}`}
          key={key}
          pixelSize={options?.pixelSize}
        />
      ))}
    </defs>
  ) : null;

  return { defs, fill };
}

const GRADIENT_TILE_PERIODS = 4;

type ChartGradientDitherOptions = {
  /** Bayer matrix size. 8 = finer, 4 = chunkier. Default 8. */
  matrix?: 4 | 8;
  /** Size of each dither cell in px (pixelation/chunkiness). Default 3. */
  pixelSize?: number;
  /** Max density at the top, 0..1. Default 0.92. */
  peak?: number;
  /** Fade curve exponent. >1 holds density longer then drops fast. Default 1.35. */
  gamma?: number;
  /**
   * Force dither on/off. When omitted, follows the workspace Chart dither
   * setting (Settings → Appearance). When disabled, `fill` returns solid colors.
   */
  enabled?: boolean;
};

/**
 * Composable dithered-gradient fills for Recharts area/bar charts.
 *
 * Returns `{ ref, defs, fill }`:
 * - attach `ref` to the `<ChartContainer>` so the texture can resolve theme
 *   colors and measure the chart height,
 * - render `{defs}` inside the chart,
 * - set `fill={fill("seriesKey")}` on an `<Area>`/`<Bar>`.
 *
 * Each series' color is resolved from `--color-KEY` (so it follows palettes +
 * dark mode), then ordered-dithered into a vertical gradient that fades toward
 * the baseline — regenerated on resize and on theme/palette changes.
 */
export function useChartGradientDither(
  config: ChartConfig,
  options?: ChartGradientDitherOptions
) {
  const { matrix = 8, pixelSize = 3, peak, gamma } = options ?? {};
  const { chartDitherEnabled } = useSiteAppearance();
  const enabled = options?.enabled ?? chartDitherEnabled;
  const ref = React.useRef<HTMLDivElement | null>(null);
  const rawId = React.useId().replace(/:/g, "");
  const [height, setHeight] = React.useState(0);
  const [urls, setUrls] = React.useState<Record<string, string>>({});

  const tileWidth = matrix * pixelSize * GRADIENT_TILE_PERIODS;
  const keySig = Object.keys(config).join(",");

  // Re-resolve each series' color from the DOM and rebuild its texture. Called
  // on mount and whenever the chart resizes, its palette changes, the dither
  // setting changes, or dark mode toggles — so the output is always current.
  const regenerate = React.useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (!enabled) {
      setUrls((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const measured = Math.round(el.getBoundingClientRect().height);
    if (measured <= 0) {
      return;
    }
    const next: Record<string, string> = {};
    for (const key of keySig.split(",").filter(Boolean)) {
      const rgb = cssColorToRgb(el, `var(--color-${key})`);
      if (!rgb) {
        continue;
      }
      next[key] = createDitherGradient({
        bottomColor: rgb,
        gamma,
        height: measured,
        matrix,
        peak,
        pixelSize,
        topColor: rgb,
        width: tileWidth,
      });
    }
    setHeight(measured);
    setUrls(next);
  }, [enabled, keySig, tileWidth, matrix, pixelSize, peak, gamma]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    regenerate();
    const resizeObserver = new ResizeObserver(regenerate);
    resizeObserver.observe(el);
    const paletteObserver = new MutationObserver(regenerate);
    paletteObserver.observe(el, { attributeFilter: ["data-chart-palette"] });
    const themeObserver = new MutationObserver(regenerate);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class", "data-chart-dither"],
    });
    return () => {
      resizeObserver.disconnect();
      paletteObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [regenerate]);

  const defs = enabled ? (
    <defs>
      {Object.keys(config).map((key) =>
        urls[key] ? (
          <pattern
            height={height}
            id={`grad-${rawId}-${key}`}
            key={key}
            patternUnits="userSpaceOnUse"
            width={tileWidth}
          >
            <image
              height={height}
              href={urls[key]}
              preserveAspectRatio="none"
              width={tileWidth}
            />
          </pattern>
        ) : null
      )}
    </defs>
  ) : null;

  const fill = React.useCallback(
    (key: string) =>
      enabled && urls[key]
        ? `url(#grad-${rawId}-${key})`
        : `var(--color-${key})`,
    [enabled, urls, rawId]
  );

  // When dithering, draw lines as a grid-snapped staircase (cell = pixelSize) so
  // they read as pixels too; otherwise fall back to Recharts' smooth monotone.
  const lineType = React.useMemo(
    () => (enabled ? makePixelCurve(pixelSize) : ("monotone" as const)),
    [enabled, pixelSize]
  );

  return {
    defs,
    fill,
    ref,
    enabled,
    lineType,
    /** Square off corners on `<Bar>` when dithering so bars snap to the grid. */
    barRadius: enabled ? 0 : undefined,
    /** Add to `<ChartContainer className>` so dithered shapes render crisp. */
    crispClassName: enabled ? CHART_CRISP_CLASS : "",
  };
}

type ChartDitherFillOptions = {
  /** Bayer matrix size. 8 = finer, 4 = chunkier. Default 4. */
  matrix?: 4 | 8;
  /** Size of each dither cell in px. Default 2. */
  pixelSize?: number;
  /** Flat dot coverage, 0..1. Default 0.72. */
  coverage?: number;
  /** Force on/off; defaults to the global Chart dither setting. */
  enabled?: boolean;
};

/**
 * Dithered fills for plain CSS bars (ranked lists, the storage breakdown) — the
 * non-Recharts visuals on the analytics page. Returns `{ ref, fillStyle }`:
 * attach `ref` to a container inside the `ChartPaletteScope` so each `var(...)`
 * color resolves against the active palette, then spread `fillStyle(colorVar)`
 * onto a bar.
 *
 * The texture is colored dots on a transparent tile (no solid backing), so the
 * track shows through the gaps — the same thinning-dots look as the charts.
 * Regenerates when the palette, theme, or dither setting changes.
 */
export function useChartDitherFill<T extends HTMLElement = HTMLDivElement>(
  colorVars: string[],
  options?: ChartDitherFillOptions
) {
  const { matrix = 4, pixelSize = 2, coverage = 0.72 } = options ?? {};
  const { chartDitherEnabled } = useSiteAppearance();
  const enabled = options?.enabled ?? chartDitherEnabled;
  const ref = React.useRef<T | null>(null);
  const [tiles, setTiles] = React.useState<Record<string, string>>({});
  const tile = matrix * pixelSize;
  const sig = colorVars.join("|");

  // Re-resolve each color from the DOM and rebuild its tile. Runs on mount and
  // whenever the palette, theme, or dither setting changes — same observer
  // pattern as useChartGradientDither, so it also tracks local palette overrides.
  const regenerate = React.useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (!enabled) {
      setTiles((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const next: Record<string, string> = {};
    for (const colorVar of sig.split("|").filter(Boolean)) {
      const rgb = cssColorToRgb(el, colorVar);
      if (!rgb) {
        continue;
      }
      next[colorVar] = createDitherGradient({
        bottomColor: rgb,
        gamma: 0,
        height: tile,
        matrix,
        peak: coverage,
        pixelSize,
        topColor: rgb,
        width: tile,
      });
    }
    setTiles(next);
  }, [enabled, sig, tile, matrix, pixelSize, coverage]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    regenerate();
    const paletteScope = el.closest("[data-chart-palette]");
    const paletteObserver = new MutationObserver(regenerate);
    if (paletteScope) {
      paletteObserver.observe(paletteScope, {
        attributeFilter: ["data-chart-palette"],
      });
    }
    const themeObserver = new MutationObserver(regenerate);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class", "data-chart-dither"],
    });
    return () => {
      paletteObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [regenerate]);

  const fillStyle = React.useCallback(
    (colorVar: string): React.CSSProperties =>
      enabled && tiles[colorVar]
        ? {
            backgroundImage: `url(${tiles[colorVar]})`,
            backgroundRepeat: "repeat",
            backgroundSize: `${tile}px ${tile}px`,
            imageRendering: "pixelated",
          }
        : { backgroundColor: colorVar },
    [enabled, tiles, tile]
  );

  return { ref, fillStyle, enabled };
}

/**
 * Recharts hands tooltip/legend items their raw `fill`/`color`, which for a
 * dithered series is an SVG `url(#…)` pattern reference — invalid as a CSS
 * color, so swatches render blank. Fall back to the resolved config color in
 * that case (the raw pattern fill is unusable as a swatch background).
 */
function resolveSwatchColor(
  raw: unknown,
  fallback: string | undefined
): string | undefined {
  if (typeof raw === "string" && raw.length > 0 && !raw.startsWith("url(")) {
    return raw;
  }
  return fallback;
}

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
  } & Omit<
    RechartsPrimitive.DefaultTooltipContentProps<
      TooltipValueType,
      TooltipNameType
    >,
    "accessibilityLayer"
  >) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null;
    }

    const [item] = payload;
    const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value =
      !labelKey && typeof label === "string"
        ? (config[label]?.label ?? label)
        : itemConfig?.label;

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      );
    }

    if (!value) {
      return null;
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>;
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ]);

  if (!(active && payload?.length)) {
    return null;
  }

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {nestLabel ? null : tooltipLabel}
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => {
            const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`;
            const itemConfig = getPayloadConfigFromPayload(config, item, key);
            const indicatorColor =
              color ??
              resolveSwatchColor(
                item.payload?.fill ?? item.color,
                itemConfig?.color ?? `var(--color-${key})`
              );

            return (
              <div
                className={cn(
                  "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                  indicator === "dot" && "items-center"
                )}
                key={index}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                            {
                              "h-2.5 w-2.5": indicator === "dot",
                              "w-1": indicator === "line",
                              "w-0 border-[1.5px] border-dashed bg-transparent":
                                indicator === "dashed",
                              "my-0.5": nestLabel && indicator === "dashed",
                            }
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "flex flex-1 justify-between leading-none",
                        nestLabel ? "items-end" : "items-center"
                      )}
                    >
                      <div className="grid gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="text-muted-foreground">
                          {itemConfig?.label ?? item.name}
                        </span>
                      </div>
                      {item.value != null && (
                        <span className="font-medium font-mono text-foreground tabular-nums">
                          {typeof item.value === "number"
                            ? item.value.toLocaleString()
                            : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> & {
  hideIcon?: boolean;
  nameKey?: string;
} & RechartsPrimitive.DefaultLegendContentProps) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {payload
        .filter((item) => item.type !== "none")
        .map((item, index) => {
          const key = `${nameKey ?? item.dataKey ?? "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);

          return (
            <div
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              )}
              key={index}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0 rounded-[2px]"
                  style={{
                    backgroundColor: resolveSwatchColor(
                      item.color,
                      itemConfig?.color ?? `var(--color-${key})`
                    ),
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
}

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return;
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined;

  let configLabelKey: string = key;

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string;
  }

  return configLabelKey in config ? config[configLabelKey] : config[key];
}

export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
};
