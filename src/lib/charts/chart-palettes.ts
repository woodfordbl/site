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

export type ChartPaletteToken = (typeof CHART_PALETTE_TOKENS)[number];

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
 * Workspace-wide dither toggle for charts:
 * - `off`: solid fills (default),
 * - `on`: dithered everywhere,
 * - `dark`: dithered only in dark mode.
 */
export const CHART_DITHER_MODES = ["off", "on", "dark"] as const;

export type ChartDitherMode = (typeof CHART_DITHER_MODES)[number];

export const defaultChartDitherMode: ChartDitherMode = "dark";

export const CHART_DITHER_MODE_LABELS: Record<ChartDitherMode, string> = {
  off: "Off",
  on: "Always on",
  dark: "Dark mode only",
};
