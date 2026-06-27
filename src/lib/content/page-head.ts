import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import { SITE_ORIGIN } from "@/lib/content/site-origin.ts";
import { normalizePageSlug } from "@/lib/pages/slugify.ts";
import type { Page } from "@/lib/schemas/page.ts";

export const SITE_NAME = "Blake Woodford";

const DESCRIPTION_MAX_LENGTH = 160;
const OG_IMAGE_WIDTH = "1200";
const OG_IMAGE_HEIGHT = "630";
const TABLER_ICON_PREFIX = "tabler:";

/** First non-empty text content of the page, truncated for meta description. */
export function derivePageDescription(page: Page): string {
  const parts: string[] = [];

  for (const block of page.blocks) {
    const text = getTextFromBlock(block).trim();
    if (!text) {
      continue;
    }
    parts.push(text);
    if (parts.join(" ").length >= DESCRIPTION_MAX_LENGTH) {
      break;
    }
  }

  const joined = parts.join(" ");
  if (joined.length <= DESCRIPTION_MAX_LENGTH) {
    return joined;
  }
  return `${joined.slice(0, DESCRIPTION_MAX_LENGTH - 1).trimEnd()}…`;
}

export function pageDocumentTitle(page: Page): string {
  return page.slug === "/" || page.title === SITE_NAME
    ? SITE_NAME
    : `${page.title} · ${SITE_NAME}`;
}

/** Absolute canonical URL for a shipped page. */
export function pageCanonicalUrl(page: Page): string {
  const path = normalizePageSlug(page.slug);
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}

/**
 * Vercel-rendered social card image URL for a shipped page. The `/api/og`
 * endpoint renders the params into a 1200×630 PNG, so the query string fully
 * determines the image (safe to cache immutably).
 */
export function buildOgImageUrl(page: Page): string {
  const params = new URLSearchParams({ title: page.title });
  const description = derivePageDescription(page);
  if (description) {
    params.set("desc", description);
  }
  // Only forward real emoji icons; tabler glyph refs can't render in the card.
  if (page.icon && !page.icon.startsWith(TABLER_ICON_PREFIX)) {
    params.set("icon", page.icon);
  }
  return `${SITE_ORIGIN}/api/og?${params.toString()}`;
}

interface PageMetaTag {
  content?: string;
  name?: string;
  property?: string;
  title?: string;
}

interface PageLinkTag {
  href: string;
  rel: string;
}

/** Route `head()` meta for a shipped page: title, description, Open Graph, Twitter. */
export function buildPageMeta(page: Page): PageMetaTag[] {
  const title = pageDocumentTitle(page);
  const description = derivePageDescription(page);
  const ogImage = buildOgImageUrl(page);

  const meta: PageMetaTag[] = [
    { title },
    { property: "og:title", content: title },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:url", content: pageCanonicalUrl(page) },
    { property: "og:image", content: ogImage },
    { property: "og:image:width", content: OG_IMAGE_WIDTH },
    { property: "og:image:height", content: OG_IMAGE_HEIGHT },
    { property: "og:image:alt", content: title },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:image", content: ogImage },
  ];

  if (description) {
    meta.push(
      { name: "description", content: description },
      { property: "og:description", content: description },
      { name: "twitter:description", content: description }
    );
  }

  return meta;
}

/** Route `head()` links for a shipped page: canonical URL. */
export function buildPageLinks(page: Page): PageLinkTag[] {
  return [{ rel: "canonical", href: pageCanonicalUrl(page) }];
}

/** Meta for private, local-only routes (`/p/…`): keep crawlers out. */
export function buildNoIndexMeta(): PageMetaTag[] {
  return [{ name: "robots", content: "noindex" }];
}

/** Meta for global not-found handling. */
export function buildNotFoundMeta(): PageMetaTag[] {
  const title = `Page not found · ${SITE_NAME}`;
  return [{ title }, { name: "robots", content: "noindex" }];
}
