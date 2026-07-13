import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { isActivePage, useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageReposition } from "@/hooks/use-page-reposition.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { buildPageLinkUrl } from "@/lib/pages/copy-page-link.ts";
import { duplicatePage } from "@/lib/pages/duplicate-page.ts";
import { canDeletePage } from "@/lib/pages/page-delete.ts";
import { resolveDeleteRedirectTarget } from "@/lib/pages/resolve-page-nav-target.ts";
import { appToast } from "@/lib/toast/app-toast.ts";
import {
  TOAST_ID_COPY_LINK,
  TOAST_ID_COPY_LINK_ERROR,
} from "@/lib/toast/toast-ids.ts";

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
      appToast.success("Link copied to clipboard", { id: TOAST_ID_COPY_LINK });
    } catch {
      appToast.error("Could not copy link", { id: TOAST_ID_COPY_LINK_ERROR });
    }
  }, [pageId, pages]);

  const duplicate = useCallback(
    (withContent = true) => {
      if (!page) {
        return;
      }

      duplicatePage({ dispatch, page, withContent });
    },
    [dispatch, page]
  );

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
