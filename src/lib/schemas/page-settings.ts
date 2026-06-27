import { z } from "zod";

export const pageFontSchema = z.enum(["default", "serif", "mono"]);

export type PageFont = z.infer<typeof pageFontSchema>;

export const pageTextScaleSchema = z.enum(["small", "default", "large"]);

export type PageTextScale = z.infer<typeof pageTextScaleSchema>;

export const pageSettingsSchema = z.object({
  font: pageFontSchema.optional(),
  fullWidth: z.boolean().optional(),
  /** Per-page text size override; absent = inherit the global site default. */
  textScale: pageTextScaleSchema.optional(),
});

export type PageSettings = z.infer<typeof pageSettingsSchema>;

export const DEFAULT_PAGE_FONT: PageFont = "default";

export const DEFAULT_PAGE_TEXT_SCALE: PageTextScale = "default";

export function resolvePageFont(font: PageFont | undefined): PageFont {
  return font ?? DEFAULT_PAGE_FONT;
}

export function resolvePageTextScale(
  textScale: PageTextScale | undefined
): PageTextScale {
  return textScale ?? DEFAULT_PAGE_TEXT_SCALE;
}

export function resolvePageFullWidth(fullWidth: boolean | undefined): boolean {
  return fullWidth ?? false;
}
