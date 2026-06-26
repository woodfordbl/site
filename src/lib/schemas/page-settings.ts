import { z } from "zod";

export const pageFontSchema = z.enum(["default", "serif", "mono"]);

export type PageFont = z.infer<typeof pageFontSchema>;

export const pageSettingsSchema = z.object({
  font: pageFontSchema.optional(),
  smallText: z.boolean().optional(),
});

export type PageSettings = z.infer<typeof pageSettingsSchema>;

export const DEFAULT_PAGE_FONT: PageFont = "default";

export function resolvePageFont(font: PageFont | undefined): PageFont {
  return font ?? DEFAULT_PAGE_FONT;
}

export function resolvePageSmallText(smallText: boolean | undefined): boolean {
  return smallText ?? false;
}
