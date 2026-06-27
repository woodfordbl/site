import { useCallback, useMemo } from "react";

import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import { persistPageSettings } from "@/lib/pages/persist-page-settings.ts";
import type { Page } from "@/lib/schemas/page.ts";
import {
  type PageFont,
  type PageTextScale,
  resolvePageFont,
  resolvePageFullWidth,
} from "@/lib/schemas/page-settings.ts";

interface UsePageSettingsOptions {
  pageId: string;
  seed?: PageMetadataSeed;
  serverPage?: Pick<Page, "font" | "fullWidth" | "textScale"> | null;
}

/**
 * Resolves merged page display settings (server defaults + local overlay) and persists changes.
 *
 * `textScale` is intentionally left `undefined` when neither the local overlay
 * nor the shipped page sets it, so the page inherits the global site default via
 * the CSS cascade (see {@link pageContentTypographyProps}).
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

  const textScale = useMemo((): PageTextScale | undefined => {
    if (localPage?.textScale !== undefined) {
      return localPage.textScale;
    }
    return serverPage?.textScale ?? undefined;
  }, [localPage?.textScale, serverPage?.textScale]);

  const fullWidth = useMemo(() => {
    if (localPage?.fullWidth !== undefined) {
      return resolvePageFullWidth(localPage.fullWidth);
    }
    return resolvePageFullWidth(serverPage?.fullWidth);
  }, [localPage?.fullWidth, serverPage?.fullWidth]);

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

  const setTextScale = useCallback(
    (nextTextScale: PageTextScale | null) => {
      persistPageSettings({
        pageId,
        textScale: nextTextScale,
        pages,
        seed,
      });
    },
    [pageId, pages, seed]
  );

  const setFullWidth = useCallback(
    (nextFullWidth: boolean) => {
      persistPageSettings({
        pageId,
        fullWidth: nextFullWidth,
        pages,
        seed,
      });
    },
    [pageId, pages, seed]
  );

  return {
    font,
    fullWidth,
    setFont,
    setFullWidth,
    setTextScale,
    textScale,
  };
}
