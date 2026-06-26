import { useCallback, useMemo } from "react";

import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import { persistPageSettings } from "@/lib/pages/persist-page-settings.ts";
import type { Page } from "@/lib/schemas/page.ts";
import {
  type PageFont,
  resolvePageFont,
  resolvePageSmallText,
} from "@/lib/schemas/page-settings.ts";

interface UsePageSettingsOptions {
  pageId: string;
  seed?: PageMetadataSeed;
  serverPage?: Pick<Page, "font" | "smallText"> | null;
}

/**
 * Resolves merged page display settings (server defaults + local overlay) and persists changes.
 */
export function usePageSettings({
  pageId,
  seed,
  serverPage,
}: UsePageSettingsOptions) {
  const localPage = useLocalPageById(pageId);
  const { pages } = useMergedPageListItems();

  const font = useMemo(() => {
    if (localPage?.font !== undefined) {
      return resolvePageFont(localPage.font);
    }
    return resolvePageFont(serverPage?.font);
  }, [localPage?.font, serverPage?.font]);

  const smallText = useMemo(() => {
    if (localPage?.smallText !== undefined) {
      return resolvePageSmallText(localPage.smallText);
    }
    return resolvePageSmallText(serverPage?.smallText);
  }, [localPage?.smallText, serverPage?.smallText]);

  const setFont = useCallback(
    (nextFont: PageFont) => {
      persistPageSettings({
        pageId,
        font: nextFont,
        pages,
        seed,
      });
    },
    [pageId, pages, seed]
  );

  const setSmallText = useCallback(
    (nextSmallText: boolean) => {
      persistPageSettings({
        pageId,
        smallText: nextSmallText,
        pages,
        seed,
      });
    },
    [pageId, pages, seed]
  );

  return { font, setFont, setSmallText, smallText };
}
