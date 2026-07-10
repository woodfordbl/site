import { ImageResponse } from "@vercel/og";
import { defineHandler } from "nitro";
import { getQuery } from "nitro/h3";
import { createElement } from "react";
import { getOgFonts } from "../../src/lib/og/og-fonts.ts";

/**
 * `GET /api/og` — dynamic Open Graph image, rendered on Vercel.
 *
 * Renders a 1200×630 "paper canvas" social card from query params (`title`,
 * `desc`, `icon`): the site's cream page background with its dot grid, the
 * page emoji in an icon tile, and a brand footer with the block-color
 * palette. The query string fully determines the image, so it is cached
 * immutably.
 *
 * All colors are the site tokens from styles.css gamut-mapped to sRGB hex,
 * since Satori (the @vercel/og renderer) does not support oklch(). Fonts are
 * static Geist subsets embedded in src/lib/og/og-fonts.ts — passing custom
 * fonts replaces @vercel/og's bundled regular weight, so both 400 and 600
 * ship explicitly.
 */

const SITE_NAME = "Blake Woodford";
const SITE_DOMAIN = "buhlake.com";
const WIDTH = 1200;
const HEIGHT = 630;

// --background / --foreground / --muted-foreground / --border (light theme).
const BACKGROUND = "#f9f9f5";
const FOREGROUND = "#2e2e2b";
const MUTED = "#737373";
const BORDER = "#dededa";
const TILE = "#ffffff";
// --primary as rendered in the dark theme — richer than the light theme's
// gamut-clamped #f8461b, and the badge sits on cream where it reads better.
const ACCENT = "#e54723";
const DOT_GRID = "#dcdcd6";
// --block-text-* light values (see lib/blocks/block-colors.ts), minus the
// near-neutral gray/brown steps that vanish at footer-tick size.
const BLOCK_TICKS = [
  "#c56c21", // orange
  "#9a7d22", // yellow
  "#3b834e", // green
  "#3772bb", // blue
  "#8059bb", // purple
  "#bb4e80", // pink
  "#c53732", // red
];

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

function titleFontSize(length: number): string {
  if (length > 70) {
    return "56px";
  }
  if (length > 48) {
    return "64px";
  }
  if (length > 28) {
    return "76px";
  }
  return "84px";
}

export default defineHandler((event) => {
  const query = getQuery(event);
  const title = clamp(firstString(query.title) || SITE_NAME, TITLE_MAX);
  const description = clamp(firstString(query.desc), DESC_MAX);
  const icon = firstString(query.icon);

  // Page emoji in an icon tile, mirroring the page-header treatment on site.
  const iconTile = icon
    ? createElement(
        "div",
        {
          key: "icon",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "104px",
            height: "104px",
            borderRadius: "24px",
            backgroundColor: TILE,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 2px 6px rgba(46, 46, 43, 0.06)",
            fontSize: "58px",
            marginBottom: "34px",
          },
        },
        icon
      )
    : null;

  const body = createElement(
    "div",
    {
      key: "body",
      style: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
      },
    },
    [
      iconTile,
      createElement(
        "div",
        {
          key: "title",
          style: {
            display: "flex",
            fontSize: titleFontSize(title.length),
            fontWeight: 600,
            lineHeight: 1.06,
            letterSpacing: "-0.03em",
            maxWidth: "1010px",
          },
        },
        title
      ),
      description
        ? createElement(
            "div",
            {
              key: "desc",
              style: {
                display: "flex",
                fontSize: "33px",
                color: MUTED,
                marginTop: "26px",
                lineHeight: 1.42,
                maxWidth: "930px",
              },
            },
            description
          )
        : null,
    ]
  );

  // Brand lockup: terracotta monogram badge + name + domain.
  const brand = createElement(
    "div",
    {
      key: "brand",
      style: { display: "flex", alignItems: "center" },
    },
    [
      createElement(
        "div",
        {
          key: "badge",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "52px",
            height: "52px",
            borderRadius: "13px",
            backgroundColor: ACCENT,
            color: "#fff7f2",
            fontSize: "23px",
            fontWeight: 600,
            letterSpacing: "-0.02em",
          },
        },
        "BW"
      ),
      createElement(
        "div",
        {
          key: "name",
          style: {
            display: "flex",
            marginLeft: "18px",
            fontSize: "29px",
            fontWeight: 600,
          },
        },
        SITE_NAME
      ),
      createElement(
        "div",
        {
          key: "site",
          style: {
            display: "flex",
            marginLeft: "14px",
            fontSize: "29px",
            color: MUTED,
          },
        },
        `· ${SITE_DOMAIN}`
      ),
    ]
  );

  // The site's block-color palette as a quiet signature.
  const ticks = createElement(
    "div",
    {
      key: "ticks",
      style: { display: "flex", gap: "10px" },
    },
    BLOCK_TICKS.map((color) =>
      createElement("div", {
        key: color,
        style: {
          display: "flex",
          width: "18px",
          height: "18px",
          borderRadius: "6px",
          backgroundColor: color,
        },
      })
    )
  );

  const footer = createElement(
    "div",
    {
      key: "footer",
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      },
    },
    [brand, ticks]
  );

  const card = createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "72px 84px 60px",
        backgroundColor: BACKGROUND,
        // The page canvas dot grid, at the same faintness as the app.
        backgroundImage: `radial-gradient(circle at 22px 22px, ${DOT_GRID} 0%, ${DOT_GRID} 6%, transparent 6%)`,
        backgroundSize: "44px 44px",
        color: FOREGROUND,
        fontFamily: "Geist",
      },
    },
    [body, footer]
  );

  return new ImageResponse(card, {
    width: WIDTH,
    height: HEIGHT,
    fonts: getOgFonts(),
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
