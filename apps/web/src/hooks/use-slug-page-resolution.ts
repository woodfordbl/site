import { useRef } from "react";

import { useResolvedUserPageById } from "@/hooks/use-resolved-page.ts";
import {
  getRememberedSlugPageId,
  rememberSlugPageResolution,
} from "@/lib/pages/remember-slug-page-resolution.ts";
import { normalizePageSlug } from "@/lib/pages/slugify.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

/**
 * Resolves a page from the URL slug, falling back to the last id seen for that slug.
 * Survives HMR/remounts so renamed pages do not 404 while the address bar still holds the old slug.
 *
 * The in-render live id is scoped to the current URL slug — navigating within
 * `/p/$` (or `/$`) to a different splat must not reuse the previous page id,
 * or database subpaths steal the prior page and get rewritten away.
 */
export function useSlugPageResolution(
  slug: string,
  pageBySlug: LocalPage | null
): LocalPage | null {
  const normalized = normalizePageSlug(slug);
  const liveIdRef = useRef<{ id: string; slug: string } | null>(null);

  if (pageBySlug) {
    liveIdRef.current = { id: pageBySlug.id, slug: normalized };
    rememberSlugPageResolution(normalized, pageBySlug.id);
  } else if (liveIdRef.current?.slug !== normalized) {
    liveIdRef.current = null;
  }

  const fallbackId = pageBySlug
    ? null
    : (liveIdRef.current?.id ?? getRememberedSlugPageId(normalized));
  const pageById = useResolvedUserPageById(fallbackId);
  const page = pageBySlug ?? pageById;

  if (page && pageBySlug) {
    rememberSlugPageResolution(normalized, page.id);
  }

  return page;
}
