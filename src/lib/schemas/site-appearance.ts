import { z } from "zod";

import {
  DEFAULT_PAGE_TEXT_SCALE,
  pageTextScaleSchema,
} from "@/lib/schemas/page-settings.ts";

export const themePreferenceSchema = z.enum(["light", "dark", "system"]);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const siteAppearanceSchema = z.object({
  theme: themePreferenceSchema,
  /** Site-wide default text size; pages may override per-page. */
  textScale: pageTextScaleSchema.default(DEFAULT_PAGE_TEXT_SCALE),
});

export type SiteAppearance = z.infer<typeof siteAppearanceSchema>;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export const DEFAULT_SITE_APPEARANCE: SiteAppearance = {
  theme: DEFAULT_THEME_PREFERENCE,
  textScale: DEFAULT_PAGE_TEXT_SCALE,
};

export type ResolvedTheme = "light" | "dark";
