import { useMemo } from "react";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { normalizePageSlug } from "@/lib/pages/slugify.ts";
import { isUserCreatedPage, type LocalPage } from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";

import { useLocalPages } from "./use-local-pages.ts";

export type ResolvedPage =
  | { kind: "server"; page: Page }
  | { kind: "user"; page: LocalPage };

export function useResolvedUserPageById(
  pageId: string | null
): LocalPage | null {
  const localPages = useLocalPages();

  return useMemo(() => {
    if (!pageId) {
      return null;
    }

    const pages = readPagesForSlugLookup(localPages);
    return pages.find((page) => page.id === pageId) ?? null;
  }, [localPages, pageId]);
}

function readPagesForSlugLookup(syncedPages: LocalPage[]): LocalPage[] {
  if (typeof window !== "undefined" && localPagesCollection.isReady()) {
    return localPagesCollection.toArray;
  }

  return syncedPages;
}

export function useResolvedUserPage(slug: string): LocalPage | null {
  const normalized = normalizePageSlug(slug);
  const localPages = useLocalPages();

  return useMemo(() => {
    const pages = readPagesForSlugLookup(localPages);
    return pages.find((page) => page.slug === normalized) ?? null;
  }, [localPages, normalized]);
}

export function useUserPages(): LocalPage[] {
  const localPages = useLocalPages();

  return useMemo(
    () => localPages.filter((page) => isUserCreatedPage(page)),
    [localPages]
  );
}
