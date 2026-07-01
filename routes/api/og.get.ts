import { ImageResponse } from "@vercel/og";
import { defineHandler } from "nitro";
import { getQuery } from "nitro/h3";
import { createElement } from "react";

/**
 * `GET /api/og` — dynamic Open Graph image, rendered on Vercel.
 *
 * Renders a 1200×630 social card from query params (`title`, `desc`, `icon`).
 * The query string fully determines the image, so it is cached immutably.
 * `@vercel/og` bundles Geist as its default font (matching the site), so no
 * font wiring is needed here.
 */

const SITE_NAME = "Blake Woodford";
const SITE_DOMAIN = "buhlake.com";
const WIDTH = 1200;
const HEIGHT = 630;
const BACKGROUND = "#0a0a0a";
const SURFACE = "#161616";
const BORDER = "#272727";
const FOREGROUND = "#fafafa";
const MUTED = "#a1a1aa";
// Brand terracotta — the `--primary` token (oklch(0.65 0.22 34)) as sRGB hex,
// since Satori (the @vercel/og renderer) does not support oklch().
const ACCENT = "#e2542f";
const TITLE_MAX = 90;
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
  if (length > 48) {
    return "60px";
  }
  if (length > 28) {
    return "76px";
  }
  return "92px";
}

export default defineHandler((event) => {
  const query = getQuery(event);
  const title = clamp(firstString(query.title) || SITE_NAME, TITLE_MAX);
  const description = clamp(firstString(query.desc), DESC_MAX);
  const icon = firstString(query.icon);

  // Brand lockup (monogram badge + name), shown top-left on every card.
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
            width: "64px",
            height: "64px",
            borderRadius: "16px",
            backgroundColor: SURFACE,
            border: `1px solid ${BORDER}`,
            fontSize: "30px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          },
        },
        "BW"
      ),
      createElement(
        "div",
        {
          key: "wordmark",
          style: {
            display: "flex",
            marginLeft: "22px",
            fontSize: "32px",
            fontWeight: 500,
          },
        },
        SITE_NAME
      ),
    ]
  );

  // Domain pill on the right, with a small accent dot.
  const domain = createElement(
    "div",
    {
      key: "domain",
      style: { display: "flex", alignItems: "center", fontSize: "28px" },
    },
    [
      createElement("div", {
        key: "dot",
        style: {
          display: "flex",
          width: "14px",
          height: "14px",
          borderRadius: "9999px",
          backgroundColor: ACCENT,
          marginRight: "14px",
        },
      }),
      createElement(
        "div",
        { key: "label", style: { display: "flex", color: MUTED } },
        SITE_DOMAIN
      ),
    ]
  );

  const header = createElement(
    "div",
    {
      key: "header",
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      },
    },
    [brand, domain]
  );

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
      icon
        ? createElement(
            "div",
            {
              key: "icon",
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "108px",
                height: "108px",
                borderRadius: "24px",
                backgroundColor: SURFACE,
                border: `1px solid ${BORDER}`,
                fontSize: "62px",
                marginBottom: "36px",
              },
            },
            icon
          )
        : null,
      createElement(
        "div",
        {
          key: "title",
          style: {
            display: "flex",
            fontSize: titleFontSize(title.length),
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: "1000px",
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
                fontSize: "34px",
                color: MUTED,
                marginTop: "28px",
                lineHeight: 1.4,
                maxWidth: "920px",
              },
            },
            description
          )
        : null,
    ]
  );

  // Thin accent rule anchoring the bottom edge.
  const accentRule = createElement("div", {
    key: "rule",
    style: {
      display: "flex",
      width: "96px",
      height: "8px",
      borderRadius: "9999px",
      backgroundColor: ACCENT,
    },
  });

  const card = createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "72px 84px",
        backgroundColor: BACKGROUND,
        // Faint brand glow in the top-right for depth.
        backgroundImage:
          "radial-gradient(1100px 520px at 100% 0%, rgba(226, 84, 47, 0.12), rgba(10, 10, 10, 0) 62%)",
        color: FOREGROUND,
        fontFamily: "Geist",
      },
    },
    [header, body, accentRule]
  );

  return new ImageResponse(card, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
