import { z } from "zod";

import {
  CHART_PALETTE_IDS,
  defaultChartPaletteId,
} from "@/lib/charts/chart-palettes.ts";
import {
  DEFAULT_PAGE_TEXT_SCALE,
  pageTextScaleSchema,
} from "@/lib/schemas/page-settings.ts";

export const themePreferenceSchema = z.enum(["light", "dark", "system"]);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const chartPaletteSchema = z.enum(CHART_PALETTE_IDS);

export const siteAppearanceSchema = z.object({
  theme: themePreferenceSchema,
  /** Site-wide default text size; pages may override per-page. */
  textScale: pageTextScaleSchema.default(DEFAULT_PAGE_TEXT_SCALE),
  /** Default color palette for charts across the workspace. */
  chartPalette: chartPaletteSchema.default(defaultChartPaletteId),
});

export type SiteAppearance = z.infer<typeof siteAppearanceSchema>;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export const DEFAULT_SITE_APPEARANCE: SiteAppearance = {
  theme: DEFAULT_THEME_PREFERENCE,
  textScale: DEFAULT_PAGE_TEXT_SCALE,
  chartPalette: defaultChartPaletteId,
};

export type ResolvedTheme = "light" | "dark";
