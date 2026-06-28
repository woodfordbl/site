import { useCallback } from "react";

import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { readTemplateSnapshotForCreate } from "@/lib/pages/template-store.ts";

/**
 * Returns a `createPage` action used by every "New page" entry point. When a
 * template is configured (Settings → Template), the new page is seeded with a
 * deep clone of the template's full snapshot — every block (including column
 * widths and other layout props) plus all display settings (icon, cover, font,
 * width, text size). Otherwise it falls back to a blank page.
 */
export function useCreatePage(pages: PageSummary[] = []) {
  const dispatch = usePageDispatch(pages);
  const { templatePageId } = useTemplatePage();

  return useCallback(() => {
    const snapshot = templatePageId ? readTemplateSnapshotForCreate() : null;

    if (!snapshot) {
      dispatch({ type: "page.create", title: DEFAULT_PAGE_TITLE });
      return;
    }

    dispatch({
      type: "page.create",
      title: DEFAULT_PAGE_TITLE,
      initialBlocks: clonePageBlocks(snapshot.blocks),
      icon: snapshot.icon,
      headerImage: snapshot.headerImage,
      font: snapshot.font,
      fullWidth: snapshot.fullWidth,
      textScale: snapshot.textScale,
    });
  }, [dispatch, templatePageId]);
}
