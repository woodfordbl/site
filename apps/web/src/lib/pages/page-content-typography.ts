import type { PageFont, PageTextScale } from "@/lib/schemas/page-settings.ts";

/**
 * Class names and data attributes for page content typography (canvas + title).
 *
 * Size is driven by the `data-page-text-scale` attribute, which the global CSS
 * (`styles.css`) turns into the `--page-text-scale` multiplier that the `--fs-*`
 * typography tokens read. The attribute is emitted only when the page sets an
 * explicit `textScale`; an unset page omits it and inherits the global default
 * carried on `<html>` via the cascade.
 */
export function pageContentTypographyProps(options: {
  font: PageFont;
  textScale: PageTextScale | undefined;
}): {
  className: string;
  "data-page-font"?: PageFont;
  "data-page-text-scale"?: PageTextScale;
} {
  const { font, textScale } = options;

  return {
    className: "",
    ...(font === "default" ? {} : { "data-page-font": font }),
    ...(textScale ? { "data-page-text-scale": textScale } : {}),
  };
}
