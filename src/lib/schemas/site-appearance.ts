import { z } from "zod";

import {
  CHART_DITHER_MODES,
  CHART_PALETTE_IDS,
  defaultChartDitherMode,
  defaultChartPaletteId,
} from "@/lib/charts/chart-palettes.ts";
import {
  DEFAULT_PAGE_TEXT_SCALE,
  pageTextScaleSchema,
} from "@/lib/schemas/page-settings.ts";

export const themePreferenceSchema = z.enum(["light", "dark", "system"]);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const chartPaletteSchema = z.enum(CHART_PALETTE_IDS);

export const chartDitherModeSchema = z.enum(CHART_DITHER_MODES);

/**
 * Tooltip surface treatment relative to page chrome.
 * - `normal` — popover surface (`bg-popover`), matching menus/dialogs.
 * - `inverted` — opposite of page chrome (dark tooltips in light mode, light in dark).
 */
export const tooltipStyleSchema = z.enum(["normal", "inverted"]);

export type TooltipStyle = z.infer<typeof tooltipStyleSchema>;

export const DEFAULT_TOOLTIP_STYLE: TooltipStyle = "normal";

export const siteAppearanceSchema = z.object({
  theme: themePreferenceSchema,
  /** Site-wide default text size; pages may override per-page. */
  textScale: pageTextScaleSchema.default(DEFAULT_PAGE_TEXT_SCALE),
  /** Default color palette for charts across the workspace. */
  chartPalette: chartPaletteSchema.default(defaultChartPaletteId),
  /** Whether charts render with a dither texture (off / on / dark mode only). */
  chartDither: chartDitherModeSchema.default(defaultChartDitherMode),
  /** Tooltip surface: popover-matched (`normal`) or opposite of page chrome (`inverted`). */
  tooltipStyle: tooltipStyleSchema.default(DEFAULT_TOOLTIP_STYLE),
});

export type SiteAppearance = z.infer<typeof siteAppearanceSchema>;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export const DEFAULT_SITE_APPEARANCE: SiteAppearance = {
  theme: DEFAULT_THEME_PREFERENCE,
  textScale: DEFAULT_PAGE_TEXT_SCALE,
  chartPalette: defaultChartPaletteId,
  chartDither: defaultChartDitherMode,
  tooltipStyle: DEFAULT_TOOLTIP_STYLE,
};

export type ResolvedTheme = "light" | "dark";
