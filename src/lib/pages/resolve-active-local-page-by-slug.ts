import { normalizePageSlug } from "@/lib/pages/slugify.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";

/**
 * Resolves any live local page row by metadata slug (user or lazy-seeded shipped).
 * @see docs/architecture/pages.md#navigation
 */
export function resolveActiveLocalPageBySlug(
  pages: LocalPage[],
  slug: string
): LocalPage | null {
  const normalized = normalizePageSlug(slug);

  return (
    pages.find(
      (page) => page.slug === normalized && !isLocallyDeletedPage(page)
    ) ?? null
  );
}

/**
 * Lazy-seeded shipped overlay on `/$` when metadata slug no longer matches server JSON.
 * @see docs/architecture/pages.md#slug-rules
 */
export function resolveActiveShippedOverlayBySlug(
  pages: LocalPage[],
  slug: string
): LocalPage | null {
  const page = resolveActiveLocalPageBySlug(pages, slug);

  if (!page || isUserCreatedPage(page)) {
    return null;
  }

  return page;
}
