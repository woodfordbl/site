import { useCallback, useMemo } from "react";

import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import { persistPageSettings } from "@/lib/pages/persist-page-settings.ts";
import type { Page } from "@/lib/schemas/page.ts";
import {
  type PageFont,
  type PageHeaderImage,
  resolvePageFont,
  resolvePageFullWidth,
  resolvePageSmallText,
} from "@/lib/schemas/page-settings.ts";

interface UsePageSettingsOptions {
  pageId: string;
  seed?: PageMetadataSeed;
  serverPage?: Pick<
    Page,
    "font" | "fullWidth" | "smallText" | "headerImage"
  > | null;
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

  const fullWidth = useMemo(() => {
    if (localPage?.fullWidth !== undefined) {
      return resolvePageFullWidth(localPage.fullWidth);
    }
    return resolvePageFullWidth(serverPage?.fullWidth);
  }, [localPage?.fullWidth, serverPage?.fullWidth]);

  // A local document always wins once it exists, so an explicit local removal
  // (headerImage cleared) correctly hides a server-shipped cover.
  const headerImage = useMemo((): PageHeaderImage | undefined => {
    if (localPage) {
      return localPage.headerImage;
    }
    return serverPage?.headerImage;
  }, [localPage, serverPage?.headerImage]);

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

  const setHeaderImage = useCallback(
    (nextHeaderImage: PageHeaderImage | null) => {
      persistPageSettings({
        pageId,
        headerImage: nextHeaderImage,
        pages,
        seed,
      });
    },
    [pageId, pages, seed]
  );

  return {
    font,
    fullWidth,
    headerImage,
    setFont,
    setFullWidth,
    setHeaderImage,
    setSmallText,
    smallText,
  };
}
