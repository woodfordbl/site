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

export const siteAppearanceSchema = z.object({
  theme: themePreferenceSchema,
  /** Site-wide default text size; pages may override per-page. */
  textScale: pageTextScaleSchema.default(DEFAULT_PAGE_TEXT_SCALE),
  /** Default color palette for charts across the workspace. */
  chartPalette: chartPaletteSchema.default(defaultChartPaletteId),
  /** Whether charts render with a dither texture (off / on / dark mode only). */
  chartDither: chartDitherModeSchema.default(defaultChartDitherMode),
});

export type SiteAppearance = z.infer<typeof siteAppearanceSchema>;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export const DEFAULT_SITE_APPEARANCE: SiteAppearance = {
  theme: DEFAULT_THEME_PREFERENCE,
  textScale: DEFAULT_PAGE_TEXT_SCALE,
  chartPalette: defaultChartPaletteId,
  chartDither: defaultChartDitherMode,
};

export type ResolvedTheme = "light" | "dark";
