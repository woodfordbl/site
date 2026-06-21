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
 */
export function useSlugPageResolution(
  slug: string,
  pageBySlug: LocalPage | null
): LocalPage | null {
  const normalized = normalizePageSlug(slug);
  const liveIdRef = useRef<string | null>(null);

  if (pageBySlug) {
    liveIdRef.current = pageBySlug.id;
    rememberSlugPageResolution(normalized, pageBySlug.id);
  }

  const fallbackId = pageBySlug
    ? null
    : (liveIdRef.current ?? getRememberedSlugPageId(normalized));
  const pageById = useResolvedUserPageById(fallbackId);
  const page = pageBySlug ?? pageById;

  if (page) {
    rememberSlugPageResolution(normalized, page.id);
  }

  return page;
}
