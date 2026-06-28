import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";

import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";
import { isActivePage, useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageReposition } from "@/hooks/use-page-reposition.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import { buildPageLinkUrl } from "@/lib/pages/copy-page-link.ts";
import { canDeletePage } from "@/lib/pages/page-delete.ts";
import { resolveDeleteRedirectTarget } from "@/lib/pages/resolve-page-nav-target.ts";
import { resolveSourceBlocksForPage } from "@/lib/pages/resolve-source-page-blocks.ts";

export function usePageActions(pageId: string) {
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);
  const reposition = usePageReposition(pages, dispatch);
  const navigate = useNavigate();
  const activePage = useActivePageRef();

  const page = pages.find((candidate) => candidate.id === pageId);
  const canDelete = canDeletePage(pageId, pages);

  const copyLink = useCallback(async () => {
    const url = buildPageLinkUrl(pageId, pages, window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  }, [pageId, pages]);

  const duplicate = useCallback(() => {
    if (!page) {
      return;
    }

    // Read local blocks lazily (non-reactively) so this hook stays SSR-safe —
    // a live query here would abort server rendering (no getServerSnapshot).
    const localBlocks = readBootstrapPageBlocks(pageId).blocks;
    resolveSourceBlocksForPage(page, localBlocks)
      .then((sourceBlocks) => {
        dispatch({
          type: "page.create",
          title: `Copy of ${page.title}`,
          parentId: page.parentId,
          insertAfterPageId: pageId,
          initialBlocks: clonePageBlocks(sourceBlocks),
        });
      })
      .catch(() => undefined);
  }, [dispatch, page, pageId]);

  const moveTo = useCallback(
    (parentId: string | null) => {
      reposition({
        appendPageLinkOnParent: false,
        insertBeforePageId: null,
        pageId,
        parentId,
      });
    },
    [pageId, reposition]
  );

  const deletePage = useCallback(() => {
    dispatch({ type: "page.delete", pageId });

    if (page && isActivePage(page.id, page.slug, activePage)) {
      navigate({
        ...resolveDeleteRedirectTarget(pageId, pages),
        replace: true,
      });
    }
  }, [activePage, dispatch, navigate, page, pageId, pages]);

  return {
    canDelete,
    copyLink,
    deletePage,
    duplicate,
    moveTo,
    page,
    pages: pages as PageSummary[],
  };
}
