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
  const params = new URLSearchParams();
  // The home page's card carries the site name (the endpoint default), not
  // its internal "Home" page title.
  if (page.slug !== "/" && page.title !== SITE_NAME) {
    params.set("title", page.title);
  }
  const description = derivePageDescription(page);
  if (description) {
    params.set("desc", description);
  }
  // Only forward real emoji icons; tabler glyph refs can't render in the card.
  if (page.icon && !page.icon.startsWith(TABLER_ICON_PREFIX)) {
    params.set("icon", page.icon);
  }
  const query = params.toString();
  return query ? `${SITE_ORIGIN}/api/og?${query}` : `${SITE_ORIGIN}/api/og`;
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

  return buildSocialMeta({
    title,
    description,
    url: pageCanonicalUrl(page),
    ogImage,
  });
}

/**
 * Site-wide fallback meta for routes without their own page meta (applied at
 * the root; TanStack dedupes by name/property with leaf routes winning). Keeps
 * links to non-page routes rendering a full social card everywhere.
 */
export function buildDefaultSiteMeta(): PageMetaTag[] {
  return buildSocialMeta({
    title: SITE_NAME,
    description: "",
    url: `${SITE_ORIGIN}/`,
    ogImage: `${SITE_ORIGIN}/api/og`,
  });
}

function buildSocialMeta(input: {
  description: string;
  ogImage: string;
  title: string;
  url: string;
}): PageMetaTag[] {
  const { title, description, url, ogImage } = input;

  const meta: PageMetaTag[] = [
    { title },
    { property: "og:title", content: title },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_US" },
    { property: "og:url", content: url },
    { property: "og:image", content: ogImage },
    { property: "og:image:width", content: OG_IMAGE_WIDTH },
    { property: "og:image:height", content: OG_IMAGE_HEIGHT },
    { property: "og:image:alt", content: title },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:image", content: ogImage },
    { name: "twitter:image:alt", content: title },
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

/**
 * Meta for private, local-only routes (`/p/…`, `/settings`, …): keep crawlers
 * out, but still name the tab AND the social preview when a section title is
 * given — otherwise the root's site-wide og:/twitter: defaults would leak a
 * mismatched site-name preview under a section-named tab.
 */
export function buildNoIndexMeta(sectionTitle?: string): PageMetaTag[] {
  const robots: PageMetaTag = { name: "robots", content: "noindex" };
  if (!sectionTitle) {
    return [robots];
  }
  const title = `${sectionTitle} · ${SITE_NAME}`;
  const ogImage = `${SITE_ORIGIN}/api/og?${new URLSearchParams({
    title: sectionTitle,
  }).toString()}`;
  return [
    { title },
    { property: "og:title", content: title },
    { property: "og:image", content: ogImage },
    { property: "og:image:alt", content: title },
    { name: "twitter:title", content: title },
    { name: "twitter:image", content: ogImage },
    { name: "twitter:image:alt", content: title },
    robots,
  ];
}

/** Meta for global not-found handling. */
export function buildNotFoundMeta(): PageMetaTag[] {
  const title = `Page not found · ${SITE_NAME}`;
  return [{ title }, { name: "robots", content: "noindex" }];
}
