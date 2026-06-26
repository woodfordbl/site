import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import type { Page } from "@/lib/schemas/page.ts";

export const SITE_NAME = "Blake Woodford";

const DESCRIPTION_MAX_LENGTH = 160;

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

interface PageMetaTag {
  content?: string;
  name?: string;
  property?: string;
  title?: string;
}

/** Route `head()` meta for a shipped page: title, description, Open Graph, Twitter. */
export function buildPageMeta(page: Page): PageMetaTag[] {
  const title = pageDocumentTitle(page);
  const description = derivePageDescription(page);

  const meta: PageMetaTag[] = [
    { title },
    { property: "og:title", content: title },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
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

/** Meta for private, local-only routes (`/p/…`): keep crawlers out. */
export function buildNoIndexMeta(): PageMetaTag[] {
  return [{ name: "robots", content: "noindex" }];
}

/** Meta for global not-found handling. */
export function buildNotFoundMeta(): PageMetaTag[] {
  const title = `Page not found · ${SITE_NAME}`;
  return [{ title }, { name: "robots", content: "noindex" }];
}
