/**
 * @fileoverview The workspace chart palettes and the color tokens they define.
 *
 * A palette is a CSS scope, not a JavaScript value: `styles.css` defines
 * `--chart-1` … `--chart-5` under `[data-chart-palette="<id>"]` (with dark-mode
 * overrides), and any subtree carrying that attribute resolves the tokens.
 * Chart code therefore never names a color — it names a token, and the palette
 * in scope decides what that token is. {@link CHART_SERIES_COLOR_VARS} is the
 * `var(...)` reference list handed to a chart's color scale.
 */

export const CHART_PALETTE_IDS = [
  "colorful",
  "orange",
  "blue",
  "gold",
  "green",
  "purple",
  "grey",
] as const;

export type ChartPaletteId = (typeof CHART_PALETTE_IDS)[number];

export const CHART_PALETTE_TOKENS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

/**
 * `var()` references for the palette tokens, in token order — the color range
 * for a chart's ordinal color scale, and the source for
 * {@link chartSeriesColor}. Resolved by whichever `[data-chart-palette]` scope
 * the chart renders inside, so one list serves every palette and both themes.
 */
export const CHART_SERIES_COLOR_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/** Number of `--chart-N` color tokens every palette provides. */
export const CHART_COLOR_TOKEN_COUNT = CHART_PALETTE_TOKENS.length;

/** A palette token index, 1-based to match the `--chart-N` token names. */
export type ChartColorToken = 1 | 2 | 3 | 4 | 5;

export const CHART_PALETTES: Record<ChartPaletteId, { label: string }> = {
  colorful: { label: "Colorful" },
  orange: { label: "Orange" },
  blue: { label: "Blue" },
  gold: { label: "Gold" },
  green: { label: "Green" },
  purple: { label: "Purple" },
  grey: { label: "Grey" },
};

export const defaultChartPaletteId: ChartPaletteId = "colorful";

export function chartPaletteIds(): readonly ChartPaletteId[] {
  return CHART_PALETTE_IDS;
}

/**
 * The `var(--chart-N)` reference for a palette token. Indices outside 1-5
 * cannot occur through {@link ChartColorToken}, so the lookup is total.
 */
export function chartSeriesColor(token: ChartColorToken): string {
  return CHART_SERIES_COLOR_VARS[token - 1];
}

/**
 * The palette token a series at `position` gets when it carries no explicit
 * override: tokens cycle 1→5 and wrap, so a chart with more series than tokens
 * still colors every one.
 */
export function chartSeriesToken(position: number): ChartColorToken {
  const index =
    ((position % CHART_COLOR_TOKEN_COUNT) + CHART_COLOR_TOKEN_COUNT) %
    CHART_COLOR_TOKEN_COUNT;
  return (index + 1) as ChartColorToken;
}

/** Narrows an arbitrary number to a palette token, or `undefined` if it isn't one. */
export function asChartColorToken(
  value: number | undefined
): ChartColorToken | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= CHART_COLOR_TOKEN_COUNT
    ? (value as ChartColorToken)
    : undefined;
}
