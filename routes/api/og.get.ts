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
const WIDTH = 1200;
const HEIGHT = 630;
const BACKGROUND = "#0a0a0a";
const FOREGROUND = "#fafafa";
const MUTED = "#a1a1aa";
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

  const card = createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "84px",
        backgroundColor: BACKGROUND,
        color: FOREGROUND,
        fontFamily: "Geist",
      },
    },
    [
      createElement(
        "div",
        {
          key: "icon",
          style: { display: "flex", fontSize: "104px", height: "120px" },
        },
        icon
      ),
      createElement(
        "div",
        { key: "body", style: { display: "flex", flexDirection: "column" } },
        [
          createElement(
            "div",
            {
              key: "title",
              style: {
                display: "flex",
                fontSize: titleFontSize(title.length),
                fontWeight: 600,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
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
                    marginTop: "30px",
                    lineHeight: 1.4,
                    maxWidth: "920px",
                  },
                },
                description
              )
            : null,
        ]
      ),
      createElement(
        "div",
        {
          key: "footer",
          style: { display: "flex", alignItems: "center", fontSize: "30px" },
        },
        [
          createElement("div", {
            key: "dot",
            style: {
              display: "flex",
              width: "18px",
              height: "18px",
              borderRadius: "9999px",
              backgroundColor: FOREGROUND,
              marginRight: "18px",
            },
          }),
          createElement(
            "div",
            { key: "name", style: { display: "flex" } },
            SITE_NAME
          ),
        ]
      ),
    ]
  );

  return new ImageResponse(card, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
