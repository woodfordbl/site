import { useRouterState } from "@tanstack/react-router";
import { useContext, useMemo } from "react";

import { CanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { parseActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { normalizePageSlug } from "@/lib/pages/slugify.ts";

/**
 * Resolves the page id of the canvas being edited (editor context or active route).
 * Used to infer legacy `pageLink` external-icon display when `props.variant` is absent.
 * @see docs/architecture/pages.md#page-links
 */
export function usePageLinkCanvasPageId(): string | null {
  const ctx = useContext(CanvasEditorContext);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { pages } = useMergedPageListItems();

  return useMemo(() => {
    if (ctx) {
      return ctx.currentPageId;
    }

    const active = parseActivePageRef(pathname);
    if (active.pageId) {
      return active.pageId;
    }

    if (!active.slug) {
      return null;
    }

    const normalized = normalizePageSlug(active.slug);
    return (
      pages.find((page) => normalizePageSlug(page.slug) === normalized)?.id ??
      null
    );
  }, [ctx, pages, pathname]);
}
