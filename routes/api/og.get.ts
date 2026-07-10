import { ImageResponse } from "@vercel/og";
import { defineHandler } from "nitro";
import { getQuery } from "nitro/h3";
import {
  buildOgCard,
  DEFAULT_OG_VARIANT,
  isOgVariant,
} from "../../src/lib/og/og-cards.ts";
import { getOgFonts } from "../../src/lib/og/og-fonts.ts";

/**
 * `GET /api/og` — dynamic Open Graph image, rendered on Vercel.
 *
 * Renders a 1200×630 social card from query params (`title`, `desc`, `icon`,
 * and a design `variant` — see src/lib/og/og-cards.ts; the default variant is
 * what shipped pages use, the rest are previewable on /dev/og). The query
 * string fully determines the image, so it is cached immutably.
 */

const SITE_NAME = "Blake Woodford";
const WIDTH = 1200;
const HEIGHT = 630;
const TITLE_MAX = 120;
const DESC_MAX = 160;

function firstString(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
}

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max
    ? `${trimmed.slice(0, max - 1).trimEnd()}…`
    : trimmed;
}

export default defineHandler((event) => {
  const query = getQuery(event);
  const requestedVariant = firstString(query.variant);
  const variant = isOgVariant(requestedVariant)
    ? requestedVariant
    : DEFAULT_OG_VARIANT;

  const card = buildOgCard(variant, {
    title: clamp(firstString(query.title) || SITE_NAME, TITLE_MAX),
    description: clamp(firstString(query.desc), DESC_MAX),
    icon: firstString(query.icon),
  });

  return new ImageResponse(card, {
    width: WIDTH,
    height: HEIGHT,
    fonts: getOgFonts(),
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
