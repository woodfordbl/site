import { type CSSProperties, createElement, type ReactElement } from "react";

/**
 * The /api/og card designs. Each variant builds a 1200×630 element tree for
 * Satori (the @vercel/og renderer) from the same content contract, so any of
 * them can be the production default and all of them are previewable on
 * /dev/og. Variants may deliberately ignore parts of the contract (see
 * `note` on OG_VARIANTS) — a poster has no room for a description, an
 * editorial card doesn't wear an emoji.
 *
 * Satori constraints honored throughout: explicit `display: flex` on every
 * element, sRGB hex only (no oklch), linear/radial gradients, no CSS grid.
 * All colors are the styles.css tokens gamut-mapped to sRGB.
 *
 * Layout system shared by every variant:
 * - 84px horizontal padding; 72px top / 64px bottom (posters may deviate).
 * - The body is centered in the leftover space but carries its own bottom
 *   padding, so long content can never crowd the footer to zero gap.
 * - Titles/descriptions are line-clamped as a hard overflow stop on top of
 *   the endpoint's character clamps.
 */

export interface OgCardContent {
  description: string;
  icon: string;
  title: string;
}

export const OG_VARIANTS = [
  { id: "paper", label: "Paper Canvas", note: "full contract" },
  { id: "ember", label: "Warm Ember", note: "ignores icon" },
  { id: "poster", label: "Vermillion Poster", note: "title only" },
  { id: "split", label: "Sidebar Split", note: "full contract" },
  { id: "serif", label: "Serif Editorial", note: "ignores icon" },
] as const;

export type OgVariant = (typeof OG_VARIANTS)[number]["id"];

export const DEFAULT_OG_VARIANT: OgVariant = "paper";

export function isOgVariant(value: string): value is OgVariant {
  return OG_VARIANTS.some((variant) => variant.id === value);
}

const SITE_NAME = "Blake Woodford";
const SITE_DOMAIN = "buhlake.com";

// Light theme tokens.
const CREAM = "#f9f9f5";
const INK = "#2e2e2b";
const MUTED = "#737373";
const LIGHT_BORDER = "#dededa";
const DOT_GRID = "#e3e3db";
// Dark theme tokens.
const WARM_BLACK = "#181611";
const DARK_INK = "#edebe4";
const DARK_MUTED = "#9a968c";
const DARK_SURFACE = "#262219";
const DARK_SURFACE_RAISED = "#312d26";
const DARK_BORDER = "#3e3a32";
// Brand.
const ACCENT = "#e54723";
const ACCENT_BRIGHT = "#f8461b";
const CREAM_ON_ACCENT = "#fff7f2";

const PAD_X = 84;
const PAD_TOP = 72;
const PAD_BOTTOM = 64;
// Minimum air between centered body content and whatever sits below it.
const BODY_GUARD = 44;

type OgNode = ReactElement | string | null;

/**
 * Terse createElement wrapper — every Satori element is a styled div.
 * Undefined style values are stripped: Satori crashes the render worker on
 * an explicit `border: undefined` (unlike React DOM, which drops them).
 */
function el(
  key: string,
  style: CSSProperties,
  ...children: OgNode[]
): ReactElement {
  const cleanStyle: Record<string, unknown> = { display: "flex" };
  for (const [property, value] of Object.entries(style)) {
    if (value !== undefined) {
      cleanStyle[property] = value;
    }
  }
  return createElement("div", { key, style: cleanStyle }, ...children);
}

/**
 * Title size scaled down for long titles, relative to a variant's base.
 * `charsPerLine` describes the column the title lives in (~13 chars per
 * 100px of column width at these sizes); narrower columns step down sooner.
 */
function titleSize(base: number, length: number, charsPerLine = 34): string {
  const lines = length / charsPerLine;
  if (lines > 2.1) {
    return `${Math.round(base * 0.62)}px`;
  }
  if (lines > 1.4) {
    return `${Math.round(base * 0.74)}px`;
  }
  if (lines > 0.8) {
    return `${Math.round(base * 0.88)}px`;
  }
  return `${base}px`;
}

function monogramBadge(
  key: string,
  options: {
    background: string;
    border?: string;
    color: string;
    fontSize: number;
    radius: number;
    size: number;
  }
): ReactElement {
  return el(
    key,
    {
      alignItems: "center",
      justifyContent: "center",
      width: `${options.size}px`,
      height: `${options.size}px`,
      borderRadius: `${options.radius}px`,
      backgroundColor: options.background,
      border: options.border,
      color: options.color,
      fontSize: `${options.fontSize}px`,
      fontWeight: 600,
      letterSpacing: "-0.02em",
    },
    "BW"
  );
}

/**
 * True when the card's headline already is the site name (the home card) —
 * variants then suppress their secondary name text so it doesn't repeat.
 */
function isSiteTitle(content: OgCardContent): boolean {
  return content.title === SITE_NAME;
}

/** Name · domain lockup with even spacing around the separator. */
function brandLockup(options: {
  badgeSize: number;
  domainColor: string;
  nameColor: string;
  withName: boolean;
}): ReactElement[] {
  const { badgeSize, nameColor, domainColor, withName } = options;
  const lockup = [
    monogramBadge("badge", {
      background: ACCENT,
      color: CREAM_ON_ACCENT,
      fontSize: Math.round(badgeSize * 0.44),
      radius: Math.round(badgeSize * 0.25),
      size: badgeSize,
    }),
  ];
  if (withName) {
    lockup.push(
      el(
        "name",
        {
          marginLeft: "16px",
          fontSize: "27px",
          fontWeight: 600,
          color: nameColor,
        },
        SITE_NAME
      ),
      el(
        "middot",
        { marginLeft: "12px", fontSize: "27px", color: domainColor },
        "·"
      )
    );
  }
  lockup.push(
    el(
      "domain",
      {
        marginLeft: withName ? "12px" : "16px",
        fontSize: "27px",
        color: domainColor,
      },
      SITE_DOMAIN
    )
  );
  return lockup;
}

function titleBlock(
  content: OgCardContent,
  options: {
    base: number;
    charsPerLine?: number;
    color: string;
    letterSpacing?: string;
    lineHeight?: number;
    maxWidth?: number;
  }
): ReactElement {
  return el(
    "title",
    {
      // display block: Satori's lineClamp (the hard overflow stop on top of
      // the endpoint's character clamps) only applies to block elements.
      display: "block",
      fontSize: titleSize(
        options.base,
        content.title.length,
        options.charsPerLine
      ),
      fontWeight: 600,
      lineHeight: options.lineHeight ?? 1.08,
      letterSpacing: options.letterSpacing ?? "-0.025em",
      maxWidth: `${options.maxWidth ?? 1010}px`,
      color: options.color,
      lineClamp: 4,
    },
    content.title
  );
}

function descriptionBlock(
  content: OgCardContent,
  options: { color: string; fontSize?: number; maxWidth?: number }
): OgNode {
  if (!content.description) {
    return null;
  }
  return el(
    "desc",
    {
      display: "block",
      fontSize: `${options.fontSize ?? 32}px`,
      color: options.color,
      marginTop: "24px",
      lineHeight: 1.45,
      maxWidth: `${options.maxWidth ?? 900}px`,
      lineClamp: 3,
    },
    content.description
  );
}

function iconTile(
  content: OgCardContent,
  options: { background: string; border?: string; shadow?: string }
): OgNode {
  if (!content.icon) {
    return null;
  }
  return el(
    "icon",
    {
      alignItems: "center",
      justifyContent: "center",
      width: "100px",
      height: "100px",
      borderRadius: "22px",
      backgroundColor: options.background,
      border: options.border,
      boxShadow: options.shadow,
      fontSize: "54px",
      marginBottom: "36px",
    },
    content.icon
  );
}

/** B — the site's cream canvas: dot grid, icon tile, block-palette footer. */
function paperCard(content: OgCardContent): ReactElement {
  const body = el(
    "body",
    {
      flexDirection: "column",
      flexGrow: 1,
      justifyContent: "center",
      paddingBottom: `${BODY_GUARD}px`,
    },
    iconTile(content, {
      background: "#ffffff",
      border: `1px solid ${LIGHT_BORDER}`,
      shadow: "0 2px 6px rgba(46, 46, 43, 0.06)",
    }),
    titleBlock(content, { base: 84, color: INK }),
    descriptionBlock(content, { color: MUTED })
  );

  const footer = el(
    "footer",
    { alignItems: "center" },
    ...brandLockup({
      badgeSize: 48,
      nameColor: INK,
      domainColor: MUTED,
      withName: !isSiteTitle(content),
    })
  );

  return el(
    "card",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px`,
      backgroundColor: CREAM,
      backgroundImage: `radial-gradient(circle at 20px 20px, ${DOT_GRID} 0%, ${DOT_GRID} 4.5%, transparent 4.5%)`,
      backgroundSize: "40px 40px",
      color: INK,
      fontFamily: "Geist",
    },
    body,
    footer
  );
}

/** A — warm charcoal, terracotta glow and bottom rule. Type does the work. */
function emberCard(content: OgCardContent): ReactElement {
  const header = el(
    "header",
    { alignItems: "center", justifyContent: "space-between" },
    el(
      "brand",
      { alignItems: "center" },
      monogramBadge("badge", {
        background: DARK_SURFACE,
        border: `1px solid ${DARK_BORDER}`,
        color: DARK_INK,
        fontSize: 25,
        radius: 14,
        size: 56,
      }),
      isSiteTitle(content)
        ? null
        : el(
            "name",
            { marginLeft: "18px", fontSize: "28px", fontWeight: 600 },
            SITE_NAME
          )
    ),
    el(
      "domain",
      { alignItems: "center", fontSize: "27px", color: DARK_MUTED },
      el("dot", {
        width: "12px",
        height: "12px",
        borderRadius: "9999px",
        backgroundColor: ACCENT,
        marginRight: "12px",
      }),
      SITE_DOMAIN
    )
  );

  const body = el(
    "body",
    {
      flexDirection: "column",
      flexGrow: 1,
      justifyContent: "center",
      paddingBottom: `${BODY_GUARD}px`,
    },
    titleBlock(content, { base: 88, color: DARK_INK }),
    descriptionBlock(content, { color: DARK_MUTED })
  );

  const rule = el("rule", {
    width: "96px",
    height: "6px",
    borderRadius: "9999px",
    backgroundColor: ACCENT,
  });

  return el(
    "card",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px`,
      backgroundColor: WARM_BLACK,
      backgroundImage:
        "radial-gradient(1100px 520px at 100% 0%, rgba(229, 71, 35, 0.18), rgba(24, 22, 17, 0) 62%)",
      color: DARK_INK,
      fontFamily: "Geist",
    },
    header,
    body,
    rule
  );
}

/** C — full-bleed terracotta poster; title only, bottom-anchored. */
function posterCard(content: OgCardContent): ReactElement {
  const top = el(
    "top",
    { alignItems: "center", justifyContent: "space-between" },
    monogramBadge("badge", {
      background: CREAM_ON_ACCENT,
      color: ACCENT,
      fontSize: 24,
      radius: 14,
      size: 56,
    }),
    el(
      "domain",
      { fontSize: "27px", color: "rgba(255, 247, 242, 0.85)" },
      SITE_DOMAIN
    )
  );

  const body = el(
    "body",
    { flexDirection: "column", flexGrow: 1, justifyContent: "flex-end" },
    isSiteTitle(content)
      ? null
      : el(
          "kicker",
          {
            fontSize: "24px",
            letterSpacing: "0.16em",
            color: "rgba(255, 247, 242, 0.78)",
            marginBottom: "22px",
          },
          SITE_NAME.toUpperCase()
        ),
    el(
      "title",
      {
        display: "block",
        fontSize: titleSize(104, content.title.length),
        fontWeight: 600,
        lineHeight: 1.05,
        letterSpacing: "-0.03em",
        maxWidth: "1030px",
        lineClamp: 4,
      },
      content.title
    )
  );

  return el(
    "card",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: `${PAD_TOP}px ${PAD_X}px 72px`,
      backgroundImage: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_BRIGHT} 60%, #ff6b35 100%)`,
      color: CREAM_ON_ACCENT,
      fontFamily: "Geist",
    },
    top,
    body
  );
}

/** D — a miniature of the app: dark sidebar with ghost rows, cream content. */
function splitCard(content: OgCardContent): ReactElement {
  const rowWidths = [128, 176, 104, 150, 118, 88, 140];
  const activeRow = 1;

  const rows = rowWidths.map((width, index) =>
    el(
      `row-${index}`,
      { alignItems: "center", gap: "13px" },
      el(`row-icon-${index}`, {
        width: "20px",
        height: "20px",
        borderRadius: "5px",
        backgroundColor: index === activeRow ? ACCENT : DARK_SURFACE_RAISED,
      }),
      el(`row-bar-${index}`, {
        width: `${width}px`,
        height: "11px",
        borderRadius: "9999px",
        backgroundColor: index === activeRow ? "#59523f" : DARK_SURFACE_RAISED,
      })
    )
  );

  const sidebar = el(
    "sidebar",
    {
      width: "320px",
      flexDirection: "column",
      gap: "28px",
      padding: "52px 40px",
      backgroundColor: WARM_BLACK,
    },
    el(
      "brand",
      { alignItems: "center", gap: "14px" },
      monogramBadge("badge", {
        background: ACCENT,
        color: CREAM_ON_ACCENT,
        fontSize: 19,
        radius: 11,
        size: 44,
      }),
      isSiteTitle(content)
        ? null
        : el(
            "name",
            { fontSize: "25px", fontWeight: 600, color: DARK_INK },
            "Blake"
          )
    ),
    el(
      "rows",
      { flexDirection: "column", gap: "17px", marginTop: "4px" },
      ...rows
    )
  );

  const crumb = el(
    "crumb",
    {
      alignItems: "center",
      gap: "12px",
      fontSize: "26px",
      color: MUTED,
      marginBottom: "28px",
    },
    content.icon
      ? el(
          "crumb-icon",
          { fontSize: "26px", alignItems: "center", height: "26px" },
          content.icon
        )
      : null,
    SITE_DOMAIN
  );

  const main = el(
    "main",
    {
      flexDirection: "column",
      flexGrow: 1,
      justifyContent: "center",
      padding: "72px 80px",
    },
    crumb,
    titleBlock(content, {
      base: 78,
      charsPerLine: 24,
      color: INK,
      maxWidth: 720,
    }),
    descriptionBlock(content, { color: MUTED, fontSize: 30, maxWidth: 700 })
  );

  return el(
    "card",
    {
      width: "100%",
      height: "100%",
      backgroundColor: CREAM,
      color: INK,
      fontFamily: "Geist",
    },
    sidebar,
    main
  );
}

/** E — bookplate: heavy ink rules top and bottom, Source Serif 4 headline. */
function serifCard(content: OgCardContent): ReactElement {
  const topRule = el(
    "top-rule",
    {
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: `3px solid ${INK}`,
      paddingBottom: "24px",
    },
    isSiteTitle(content)
      ? el("dot", {
          width: "12px",
          height: "12px",
          borderRadius: "9999px",
          backgroundColor: ACCENT,
        })
      : el("name", { fontSize: "29px", fontWeight: 600 }, SITE_NAME),
    el("domain", { fontSize: "25px", color: MUTED }, SITE_DOMAIN)
  );

  const body = el(
    "body",
    {
      flexDirection: "column",
      flexGrow: 1,
      justifyContent: "center",
      paddingBottom: "24px",
    },
    el(
      "title",
      {
        display: "block",
        fontFamily: "Source Serif 4",
        fontSize: titleSize(94, content.title.length),
        fontWeight: 600,
        lineHeight: 1.12,
        letterSpacing: "-0.01em",
        maxWidth: "1000px",
        color: INK,
        lineClamp: 4,
      },
      content.title
    ),
    content.description
      ? el(
          "desc",
          {
            display: "block",
            fontSize: "30px",
            color: MUTED,
            marginTop: "28px",
            lineHeight: 1.5,
            maxWidth: "880px",
            lineClamp: 3,
          },
          content.description
        )
      : null
  );

  // Bottom rule mirrors the top; a short terracotta segment signs it.
  const bottomRule = el(
    "bottom-rule",
    { height: "3px" },
    el("accent-segment", {
      width: "96px",
      height: "3px",
      backgroundColor: ACCENT,
    }),
    el("ink-segment", { flexGrow: 1, height: "3px", backgroundColor: INK })
  );

  return el(
    "card",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: `64px ${PAD_X}px`,
      backgroundColor: CREAM,
      color: INK,
      fontFamily: "Geist",
    },
    topRule,
    body,
    bottomRule
  );
}

const CARD_BUILDERS: Record<
  OgVariant,
  (content: OgCardContent) => ReactElement
> = {
  paper: paperCard,
  ember: emberCard,
  poster: posterCard,
  split: splitCard,
  serif: serifCard,
};

export function buildOgCard(
  variant: OgVariant,
  content: OgCardContent
): ReactElement {
  return CARD_BUILDERS[variant](content);
}
