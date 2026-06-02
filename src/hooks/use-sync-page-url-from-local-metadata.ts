import { useEffect } from "react";

import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { syncPageUrl } from "@/lib/pages/sync-url.ts";
import { isUserCreatedPage } from "@/lib/schemas/local-page.ts";

export function useSyncPageUrlFromLocalMetadata(pageId: string): void {
  const localPage = useLocalPageById(pageId);

  useEffect(() => {
    if (!localPage || typeof window === "undefined") {
      return;
    }

    if (isUserCreatedPage(localPage)) {
      return;
    }

    syncPageUrl(localPage.slug);
  }, [localPage]);
}
