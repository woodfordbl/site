import { z } from "zod";

import { mediaSourceSchema } from "./block-props.ts";

export const pageFontSchema = z.enum(["default", "serif", "mono"]);

export type PageFont = z.infer<typeof pageFontSchema>;

/** Photographer attribution for an Unsplash-sourced cover (required by their API guidelines). */
export const pageHeaderImageCreditSchema = z.object({
  name: z.string(),
  username: z.string(),
  link: z.string(),
});

/**
 * Optional per-page cover ("header") image. Reuses the media block's
 * `source`/`src` encoding: `url` keeps the original URL (Unsplash CDN or any
 * pasted link), `asset` stores a content-addressed IndexedDB id for uploads.
 */
export const pageHeaderImageSchema = z.object({
  source: mediaSourceSchema,
  /** URL string when `source: "url"`; SHA-256 content hash when `source: "asset"`. */
  src: z.string(),
  alt: z.string().optional(),
  /** Present only for Unsplash covers; drives the attribution chip + link-back. */
  credit: pageHeaderImageCreditSchema.optional(),
  /** Vertical focal point as an `object-position` percentage (0 = top, 100 = bottom). */
  focalY: z.number().min(0).max(100).optional(),
});

export type PageHeaderImage = z.infer<typeof pageHeaderImageSchema>;

export const pageTextScaleSchema = z.enum(["small", "default", "large"]);

export type PageTextScale = z.infer<typeof pageTextScaleSchema>;

export const pageSettingsSchema = z.object({
  font: pageFontSchema.optional(),
  fullWidth: z.boolean().optional(),
  headerImage: pageHeaderImageSchema.optional(),
  /** Per-page text size override; absent = inherit the global site default. */
  textScale: pageTextScaleSchema.optional(),
});

export type PageSettings = z.infer<typeof pageSettingsSchema>;

export const DEFAULT_HEADER_FOCAL_Y = 50;

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
