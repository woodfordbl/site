import { describe, expect, it } from "vitest";

import { parseSiteAppearanceCookie } from "@/lib/appearance/site-appearance-cookie.ts";
import {
  DEFAULT_SITE_APPEARANCE,
  DEFAULT_TOOLTIP_STYLE,
  siteAppearanceSchema,
} from "@/lib/schemas/site-appearance.ts";

describe("site appearance tooltipStyle", () => {
  it("defaults tooltipStyle to normal when omitted from stored cookies", () => {
    const parsed = parseSiteAppearanceCookie(
      JSON.stringify({
        theme: "light",
        textScale: "default",
        chartPalette: DEFAULT_SITE_APPEARANCE.chartPalette,
      })
    );

    expect(parsed?.tooltipStyle).toBe(DEFAULT_TOOLTIP_STYLE);
  });

  it("accepts inverted tooltipStyle in the appearance schema", () => {
    const result = siteAppearanceSchema.safeParse({
      ...DEFAULT_SITE_APPEARANCE,
      tooltipStyle: "inverted",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tooltipStyle).toBe("inverted");
    }
  });

  it("rejects unknown tooltipStyle values", () => {
    const result = siteAppearanceSchema.safeParse({
      ...DEFAULT_SITE_APPEARANCE,
      tooltipStyle: "glass",
    });

    expect(result.success).toBe(false);
  });
});
