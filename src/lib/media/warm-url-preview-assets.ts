import type { UrlPreview } from "@/lib/media/parse-url-preview.ts";

/** Warm browser image cache for OG preview assets so the popover paints without a pop-in. */
export function warmUrlPreviewAssets(preview: UrlPreview): void {
  if (typeof Image === "undefined") {
    return;
  }
  for (const src of [preview.imageUrl, preview.faviconUrl]) {
    const trimmed = src?.trim();
    if (!trimmed) {
      continue;
    }
    const image = new Image();
    image.decoding = "async";
    image.src = trimmed;
  }
}
