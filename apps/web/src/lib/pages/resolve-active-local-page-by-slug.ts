import { normalizePageSlug } from "@/lib/pages/slugify.ts";
import {
  isLocallyDeletedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";

/**
 * Resolves any live local page row by metadata slug (user or lazy-seeded shipped).
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
