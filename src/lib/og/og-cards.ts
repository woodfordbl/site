import { type CSSProperties, createElement, type ReactElement } from "react";

/**
 * The /api/og card designs. Each variant builds a 1200×630 element tree for
 * Satori (the @vercel/og renderer) from the same content contract, so any of
 * them can be the production default and all of them are previewable on
 * /dev/og.
 *
 * Satori constraints honored throughout: explicit `display: flex` on every
 * element, sRGB hex only (no oklch), linear/radial gradients, no CSS grid.
 * All colors are the styles.css tokens gamut-mapped to sRGB.
 */

export interface OgCardContent {
  description: string;
  icon: string;
  title: string;
}

export const OG_VARIANTS = [
  { id: "paper", label: "Paper Canvas" },
  { id: "ember", label: "Warm Ember" },
  { id: "poster", label: "Vermillion Poster" },
  { id: "split", label: "Sidebar Split" },
  { id: "serif", label: "Serif Editorial" },
  { id: "spectrum", label: "Block Spectrum" },
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
const DOT_GRID = "#dcdcd6";
// Dark theme tokens.
const WARM_BLACK = "#181611";
const WARM_BLACK_DEEP = "#15110a";
const DARK_INK = "#edebe4";
const DARK_MUTED = "#9a968c";
const DARK_SURFACE = "#262219";
const DARK_SURFACE_RAISED = "#312d26";
const DARK_BORDER = "#3e3a32";
// Brand.
const ACCENT = "#e54723";
const ACCENT_BRIGHT = "#f8461b";
const CREAM_ON_ACCENT = "#fff7f2";
// --block-text-* light values (see lib/blocks/block-colors.ts).
const BLOCK_COLORS = {
  gray: "#72726e",
  brown: "#7e5a42",
  orange: "#c56c21",
  yellow: "#9a7d22",
  green: "#3b834e",
  blue: "#3772bb",
  purple: "#8059bb",
  pink: "#bb4e80",
  red: "#c53732",
};
// Footer ticks skip the near-neutral gray/brown steps that vanish small.
const TICK_COLORS = [
  BLOCK_COLORS.orange,
  BLOCK_COLORS.yellow,
  BLOCK_COLORS.green,
  BLOCK_COLORS.blue,
  BLOCK_COLORS.purple,
  BLOCK_COLORS.pink,
  BLOCK_COLORS.red,
];

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

/** Title size scaled down for long titles, relative to a variant's base. */
function titleSize(base: number, length: number): string {
  if (length > 70) {
    return `${Math.round(base * 0.67)}px`;
  }
  if (length > 48) {
    return `${Math.round(base * 0.76)}px`;
  }
  if (length > 28) {
    return `${Math.round(base * 0.9)}px`;
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

function titleBlock(
  content: OgCardContent,
  options: {
    base: number;
    color: string;
    letterSpacing?: string;
    lineHeight?: number;
    maxWidth?: number;
  }
): ReactElement {
  return el(
    "title",
    {
      fontSize: titleSize(options.base, content.title.length),
      fontWeight: 600,
      lineHeight: options.lineHeight ?? 1.06,
      letterSpacing: options.letterSpacing ?? "-0.03em",
      maxWidth: `${options.maxWidth ?? 1010}px`,
      color: options.color,
    },
    content.title
  );
}

function descriptionBlock(
  content: OgCardContent,
  options: { color: string; maxWidth?: number }
): OgNode {
  if (!content.description) {
    return null;
  }
  return el(
    "desc",
    {
      fontSize: "33px",
      color: options.color,
      marginTop: "26px",
      lineHeight: 1.42,
      maxWidth: `${options.maxWidth ?? 930}px`,
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
      width: "104px",
      height: "104px",
      borderRadius: "24px",
      backgroundColor: options.background,
      border: options.border,
      boxShadow: options.shadow,
      fontSize: "58px",
      marginBottom: "34px",
    },
    content.icon
  );
}

/** B — the site's cream canvas: dot grid, icon tile, block-palette footer. */
function paperCard(content: OgCardContent): ReactElement {
  const body = el(
    "body",
    { flexDirection: "column", flexGrow: 1, justifyContent: "center" },
    iconTile(content, {
      background: "#ffffff",
      border: `1px solid ${LIGHT_BORDER}`,
      shadow: "0 2px 6px rgba(46, 46, 43, 0.06)",
    }),
    titleBlock(content, { base: 84, color: INK }),
    descriptionBlock(content, { color: MUTED })
  );

  const brand = el(
    "brand",
    { alignItems: "center" },
    monogramBadge("badge", {
      background: ACCENT,
      color: CREAM_ON_ACCENT,
      fontSize: 23,
      radius: 13,
      size: 52,
    }),
    el(
      "name",
      { marginLeft: "18px", fontSize: "29px", fontWeight: 600, color: INK },
      SITE_NAME
    ),
    el(
      "site",
      { marginLeft: "14px", fontSize: "29px", color: MUTED },
      `· ${SITE_DOMAIN}`
    )
  );

  const ticks = el(
    "ticks",
    { gap: "10px" },
    ...TICK_COLORS.map((color) =>
      el(`tick-${color}`, {
        width: "18px",
        height: "18px",
        borderRadius: "6px",
        backgroundColor: color,
      })
    )
  );

  const footer = el(
    "footer",
    { alignItems: "center", justifyContent: "space-between" },
    brand,
    ticks
  );

  return el(
    "card",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: "72px 84px 60px",
      backgroundColor: CREAM,
      backgroundImage: `radial-gradient(circle at 22px 22px, ${DOT_GRID} 0%, ${DOT_GRID} 6%, transparent 6%)`,
      backgroundSize: "44px 44px",
      color: INK,
      fontFamily: "Geist",
    },
    body,
    footer
  );
}

/** A — warm charcoal with a terracotta glow and bottom rule. */
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
        fontSize: 30,
        radius: 16,
        size: 64,
      }),
      el("name", { marginLeft: "22px", fontSize: "32px" }, SITE_NAME)
    ),
    el(
      "domain",
      { alignItems: "center", fontSize: "28px", color: DARK_MUTED },
      el("dot", {
        width: "14px",
        height: "14px",
        borderRadius: "9999px",
        backgroundColor: ACCENT,
        marginRight: "14px",
      }),
      SITE_DOMAIN
    )
  );

  const body = el(
    "body",
    { flexDirection: "column", flexGrow: 1, justifyContent: "center" },
    iconTile(content, {
      background: DARK_SURFACE,
      border: `1px solid ${DARK_BORDER}`,
    }),
    titleBlock(content, { base: 84, color: DARK_INK, lineHeight: 1.05 }),
    descriptionBlock(content, { color: DARK_MUTED, maxWidth: 920 })
  );

  const rule = el("rule", {
    width: "96px",
    height: "8px",
    borderRadius: "9999px",
    backgroundColor: ACCENT,
  });

  return el(
    "card",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: "72px 84px",
      backgroundColor: WARM_BLACK,
      backgroundImage:
        "radial-gradient(1100px 520px at 100% 0%, rgba(229, 71, 35, 0.16), rgba(24, 22, 17, 0) 62%)",
      color: DARK_INK,
      fontFamily: "Geist",
    },
    header,
    body,
    rule
  );
}

/** C — full-bleed terracotta poster; drops icon and description by design. */
function posterCard(content: OgCardContent): ReactElement {
  const top = el(
    "top",
    { alignItems: "center", justifyContent: "space-between" },
    monogramBadge("badge", {
      background: "transparent",
      border: "2px solid rgba(255, 247, 242, 0.55)",
      color: CREAM_ON_ACCENT,
      fontSize: 28,
      radius: 16,
      size: 64,
    }),
    el(
      "domain",
      { fontSize: "28px", color: "rgba(255, 247, 242, 0.85)" },
      SITE_DOMAIN
    )
  );

  const body = el(
    "body",
    { flexDirection: "column", flexGrow: 1, justifyContent: "flex-end" },
    el(
      "kicker",
      {
        fontSize: "26px",
        letterSpacing: "0.14em",
        color: "rgba(255, 247, 242, 0.8)",
        marginBottom: "20px",
      },
      SITE_NAME.toUpperCase()
    ),
    titleBlock(content, {
      base: 104,
      color: CREAM_ON_ACCENT,
      letterSpacing: "-0.035em",
      lineHeight: 1.0,
      maxWidth: 1030,
    })
  );

  return el(
    "card",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: "76px 84px",
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
  const rowWidths = [120, 170, 96, 140, 110];
  const activeRow = 1;

  const rows = rowWidths.map((width, index) =>
    el(
      `row-${width}`,
      { alignItems: "center", gap: "14px" },
      el(`row-icon-${width}`, {
        width: "22px",
        height: "22px",
        borderRadius: "6px",
        backgroundColor: index === activeRow ? ACCENT : DARK_SURFACE_RAISED,
      }),
      el(`row-bar-${width}`, {
        width: `${width}px`,
        height: "12px",
        borderRadius: "9999px",
        backgroundColor: index === activeRow ? "#4a453b" : DARK_SURFACE_RAISED,
      })
    )
  );

  const sidebar = el(
    "sidebar",
    {
      width: "330px",
      flexDirection: "column",
      gap: "30px",
      padding: "56px 44px",
      backgroundColor: WARM_BLACK,
    },
    el(
      "brand",
      { alignItems: "center", gap: "16px" },
      monogramBadge("badge", {
        background: ACCENT,
        color: CREAM_ON_ACCENT,
        fontSize: 20,
        radius: 12,
        size: 46,
      }),
      el(
        "name",
        { fontSize: "26px", fontWeight: 600, color: DARK_INK },
        "Blake"
      )
    ),
    el(
      "rows",
      { flexDirection: "column", gap: "18px", marginTop: "8px" },
      ...rows
    )
  );

  const crumb = el(
    "crumb",
    {
      alignItems: "center",
      gap: "14px",
      fontSize: "27px",
      color: MUTED,
      marginBottom: "30px",
    },
    content.icon ? el("crumb-icon", { fontSize: "30px" }, content.icon) : null,
    SITE_DOMAIN
  );

  const main = el(
    "main",
    {
      flexDirection: "column",
      flexGrow: 1,
      justifyContent: "center",
      padding: "72px 76px",
    },
    crumb,
    titleBlock(content, { base: 80, color: INK, maxWidth: 720 }),
    descriptionBlock(content, { color: MUTED, maxWidth: 720 })
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

/** E — bookish: heavy ink rule, Source Serif 4 headline, hairline footer. */
function serifCard(content: OgCardContent): ReactElement {
  const topRule = el(
    "top-rule",
    {
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: `3px solid ${INK}`,
      paddingBottom: "26px",
    },
    el("name", { fontSize: "30px", fontWeight: 600 }, SITE_NAME),
    el("domain", { fontSize: "26px", color: MUTED }, SITE_DOMAIN)
  );

  const body = el(
    "body",
    { flexDirection: "column", flexGrow: 1, justifyContent: "center" },
    content.icon
      ? el("icon", { fontSize: "64px", marginBottom: "28px" }, content.icon)
      : null,
    el(
      "title",
      {
        fontFamily: "Source Serif 4",
        fontSize: titleSize(92, content.title.length),
        fontWeight: 600,
        lineHeight: 1.08,
        letterSpacing: "-0.015em",
        maxWidth: "1010px",
        color: INK,
      },
      content.title
    ),
    content.description
      ? el(
          "desc",
          {
            fontSize: "32px",
            color: MUTED,
            marginTop: "30px",
            lineHeight: 1.45,
            maxWidth: "900px",
          },
          content.description
        )
      : null
  );

  const footer = el(
    "footer",
    {
      alignItems: "center",
      gap: "18px",
      borderTop: `1px solid ${LIGHT_BORDER}`,
      paddingTop: "26px",
    },
    el("dot", {
      width: "12px",
      height: "12px",
      borderRadius: "9999px",
      backgroundColor: ACCENT,
    }),
    el("label", { fontSize: "24px", color: MUTED }, SITE_DOMAIN)
  );

  return el(
    "card",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: "70px 84px",
      backgroundColor: CREAM,
      color: INK,
      fontFamily: "Geist",
    },
    topRule,
    body,
    footer
  );
}

/** F — deepest warm black with the nine-color block palette as a baseboard. */
function spectrumCard(content: OgCardContent): ReactElement {
  const top = el(
    "top",
    { alignItems: "center", justifyContent: "space-between" },
    el(
      "brand",
      { alignItems: "center", gap: "18px" },
      monogramBadge("badge", {
        background: ACCENT,
        color: CREAM_ON_ACCENT,
        fontSize: 25,
        radius: 14,
        size: 56,
      }),
      el("name", { fontSize: "30px" }, SITE_NAME)
    ),
    el("domain", { fontSize: "27px", color: DARK_MUTED }, SITE_DOMAIN)
  );

  const body = el(
    "body",
    { flexDirection: "column", flexGrow: 1, justifyContent: "center" },
    iconTile(content, {
      background: DARK_SURFACE_RAISED,
      border: `1px solid ${DARK_BORDER}`,
    }),
    titleBlock(content, { base: 92, color: DARK_INK, lineHeight: 1.04 }),
    descriptionBlock(content, { color: DARK_MUTED, maxWidth: 920 })
  );

  const spectrum = el(
    "spectrum",
    { height: "26px" },
    ...Object.entries(BLOCK_COLORS).map(([name, color]) =>
      el(`band-${name}`, { flexGrow: 1, backgroundColor: color })
    )
  );

  return el(
    "card",
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: WARM_BLACK_DEEP,
      color: DARK_INK,
      fontFamily: "Geist",
    },
    el(
      "content",
      {
        flexDirection: "column",
        flexGrow: 1,
        padding: "76px 84px 56px",
      },
      top,
      body
    ),
    spectrum
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
  spectrum: spectrumCard,
};

export function buildOgCard(
  variant: OgVariant,
  content: OgCardContent
): ReactElement {
  return CARD_BUILDERS[variant](content);
}
