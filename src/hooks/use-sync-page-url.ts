import { useEffect } from "react";

import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { pageSlugsEqual } from "@/lib/pages/slugify.ts";
import { syncPageUrl } from "@/lib/pages/sync-url.ts";
import { isUserCreatedPage } from "@/lib/schemas/local-page.ts";

interface UseSyncPageUrlOptions {
  urlSlug?: string;
  userPage?: boolean;
}

/**
 * Syncs the address bar when page metadata drifts from the URL.
 * Route mounts pass `urlSlug`; workspace mounts omit it for passive cross-tab sync.
 */
export function useSyncPageUrl(
  pageId: string | undefined,
  options?: UseSyncPageUrlOptions
): void {
  const localPage = useLocalPageById(pageId ?? "");

  useEffect(() => {
    if (!(pageId && localPage) || typeof window === "undefined") {
      return;
    }

    const treatAsUserPage =
      options?.userPage === true || isUserCreatedPage(localPage);

    if (!options?.userPage && isUserCreatedPage(localPage)) {
      return;
    }

    if (options?.urlSlug !== undefined) {
      if (!pageSlugsEqual(localPage.slug, options.urlSlug)) {
        syncPageUrl(
          localPage.slug,
          treatAsUserPage ? { userPage: true } : undefined
        );
      }
      return;
    }

    if (isUserCreatedPage(localPage)) {
      return;
    }

    syncPageUrl(localPage.slug);
  }, [localPage, options?.urlSlug, options?.userPage, pageId]);
}
