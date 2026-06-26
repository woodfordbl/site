import { z } from "zod";

export const themePreferenceSchema = z.enum(["light", "dark", "system"]);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const siteAppearanceSchema = z.object({
  theme: themePreferenceSchema,
});

export type SiteAppearance = z.infer<typeof siteAppearanceSchema>;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export const DEFAULT_SITE_APPEARANCE: SiteAppearance = {
  theme: DEFAULT_THEME_PREFERENCE,
};

export type ResolvedTheme = "light" | "dark";
