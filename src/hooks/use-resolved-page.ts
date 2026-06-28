import { useMemo } from "react";

import { resolveActiveLocalPageBySlug } from "@/lib/pages/resolve-active-local-page-by-slug.ts";
import { resolveActiveUserPageBySlug } from "@/lib/pages/resolve-user-page-by-slug.ts";
import { normalizePageSlug } from "@/lib/pages/slugify.ts";
import { isTemplatePageId } from "@/lib/pages/template-page.ts";
import { isUserCreatedPage, type LocalPage } from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";

import { useLocalPages } from "./use-local-pages.ts";

/** Server JSON page or a user-created row from `localPagesCollection`. */
export type ResolvedPage =
  | { kind: "server"; page: Page }
  | { kind: "user"; page: LocalPage };

/**
 * Resolves a user page by stable id (sidebar payloads, `pageLink` props).
 * @see docs/architecture/pages.md#navigation
 */
export function useResolvedUserPageById(
  pageId: string | null
): LocalPage | null {
  const localPages = useLocalPages();

  return useMemo(() => {
    if (!pageId || isTemplatePageId(pageId)) {
      return null;
    }

    return localPages.find((page) => page.id === pageId) ?? null;
  }, [localPages, pageId]);
}

/**
 * Resolves a user page for `/p/$` by metadata slug (normalized path segments).
 * Skips delete tombstones via {@link resolveActiveUserPageBySlug}.
 * @see docs/architecture/pages.md#navigation
 */
export function useResolvedUserPage(slug: string): LocalPage | null {
  const normalized = normalizePageSlug(slug);
  const localPages = useLocalPages();

  return useMemo(
    () => resolveActiveUserPageBySlug(localPages, normalized),
    [localPages, normalized]
  );
}

/**
 * Resolves any live local page by metadata slug (shipped overlay or user row).
 * @see docs/architecture/pages.md#navigation
 */
export function useResolvedLocalPageBySlug(slug: string): LocalPage | null {
  const normalized = normalizePageSlug(slug);
  const localPages = useLocalPages();

  return useMemo(
    () => resolveActiveLocalPageBySlug(localPages, normalized),
    [localPages, normalized]
  );
}

/** User-created pages (`serverBaselineHash: null`) from the local collection. */
export function useUserPages(): LocalPage[] {
  const localPages = useLocalPages();

  return useMemo(
    () =>
      localPages.filter(
        (page) => isUserCreatedPage(page) && !isTemplatePageId(page.id)
      ),
    [localPages]
  );
}
