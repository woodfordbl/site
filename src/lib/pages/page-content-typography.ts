import type { PageFont } from "@/lib/schemas/page-settings.ts";
import { cn } from "@/lib/utils.ts";

/** Class names and data attributes for page content typography (canvas + title). */
export function pageContentTypographyProps(options: {
  font: PageFont;
  smallText: boolean;
}): {
  className: string;
  "data-page-font"?: PageFont;
  "data-page-small-text"?: "";
} {
  const { font, smallText } = options;

  return {
    className: cn(smallText && "text-sm"),
    ...(font === "default" ? {} : { "data-page-font": font }),
    ...(smallText ? { "data-page-small-text": "" as const } : {}),
  };
}
