import { useCallback } from "react";

import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { resolveSourceBlocksForPage } from "@/lib/pages/resolve-source-page-blocks.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";
import type { PageSettings } from "@/lib/schemas/page-settings.ts";

/** Picks only the defined page-level settings from a local page record. */
function pageSettingsFromLocalPage(page: LocalPage): PageSettings {
  const settings: PageSettings = {};
  if (page.font !== undefined) {
    settings.font = page.font;
  }
  if (page.fullWidth !== undefined) {
    settings.fullWidth = page.fullWidth;
  }
  if (page.headerImage !== undefined) {
    settings.headerImage = page.headerImage;
  }
  if (page.textScale !== undefined) {
    settings.textScale = page.textScale;
  }
  return settings;
}

/**
 * Returns a `createPage` action used by every "New page" entry point. When a
 * template page is configured (Settings → Template), the new page is seeded with
 * a clone of that page's blocks and its page-level settings; otherwise it falls
 * back to a blank page. Mirrors the duplicate-page flow in `usePageActions`.
 */
export function useCreatePage(pages: PageSummary[] = []) {
  const dispatch = usePageDispatch(pages);
  const { templatePageId } = useTemplatePage();

  return useCallback(() => {
    const templatePage = templatePageId
      ? pages.find((candidate) => candidate.id === templatePageId)
      : undefined;

    if (!(templatePageId && templatePage)) {
      dispatch({ type: "page.create", title: DEFAULT_PAGE_TITLE });
      return;
    }

    const localTemplate =
      localPagesCollection.toArray.find((page) => page.id === templatePageId) ??
      null;
    const pageSettings = localTemplate
      ? pageSettingsFromLocalPage(localTemplate)
      : undefined;

    // Read local blocks lazily (non-reactively) so this hook stays SSR-safe —
    // a live query here would abort server rendering (no getServerSnapshot).
    const localBlocks = readBootstrapPageBlocks(templatePageId).blocks;
    resolveSourceBlocksForPage(templatePage, localBlocks)
      .then((sourceBlocks) => {
        dispatch({
          type: "page.create",
          title: DEFAULT_PAGE_TITLE,
          initialBlocks: clonePageBlocks(sourceBlocks),
          pageSettings,
        });
      })
      .catch(() => {
        dispatch({ type: "page.create", title: DEFAULT_PAGE_TITLE });
      });
  }, [dispatch, pages, templatePageId]);
}
