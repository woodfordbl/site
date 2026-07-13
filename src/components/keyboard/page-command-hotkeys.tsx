"use client";

import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useCommandHotkeys } from "@/components/keyboard/use-command-hotkeys.ts";
import { DeletePageConfirmDialog } from "@/components/pages/delete-page-confirm-dialog.tsx";
import { usePageCover } from "@/components/pages/page-cover-context.tsx";
import { ConfirmDialogFooter } from "@/components/ui/confirm-dialog-footer.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { useFavoriteActions } from "@/hooks/use-favorites.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { usePageActions } from "@/hooks/use-page-actions.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageSettings } from "@/hooks/use-page-settings.ts";
import { useSavePageAsTemplate } from "@/hooks/use-save-page-as-template.ts";
import { createConfirmDialogKeyDownHandler } from "@/lib/dialog/confirm-dialog-keys.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { readPageListExpandedIdsFromDocument } from "@/lib/pages/page-list-expanded-cookie.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";
import { resolveAdjacentSidebarPageId } from "@/lib/pages/resolve-sidebar-nav-page-ids.ts";
import { isTemplatePageId } from "@/lib/pages/template-page.ts";
import type { Page } from "@/lib/schemas/page.ts";

interface PageCommandHotkeysProps {
  pageId: string;
  seed: PageMetadataSeed | undefined;
  serverPage: Page | null;
}

function PageCommandHotkeysLive({
  pageId,
  seed,
  serverPage,
}: PageCommandHotkeysProps) {
  const navigate = useNavigate();
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);
  const actions = usePageActions(pageId);
  const { toggleFavorite } = useFavoriteActions();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const currentPage = pages.find((page) => page.id === pageId);
  const saveAsTemplate = useSavePageAsTemplate(
    currentPage ?? {
      id: pageId,
      parentId: null,
      slug: "",
      title: DEFAULT_PAGE_TITLE,
    }
  );
  const cover = usePageCover();
  const { fullWidth, setFullWidth } = usePageSettings({
    pageId,
    seed,
    serverPage,
  });

  // Step to the previous/next visible sidebar row in tree preorder; wrapping is
  // intentionally avoided (no-op at the ends).
  const goToAdjacent = (delta: number) => {
    const targetId = resolveAdjacentSidebarPageId({
      activePageId: pageId,
      delta,
      expandedIds: readPageListExpandedIdsFromDocument(),
      pages,
    });
    if (targetId) {
      navigate(resolvePageNavTarget(targetId, pages));
    }
  };

  useCommandHotkeys({
    "add-cover": () => cover?.openPicker(),
    "copy-page-link": () => {
      actions.copyLink().catch(() => undefined);
    },
    "delete-page": () => {
      if (actions.canDelete) {
        setDeleteOpen(true);
      }
    },
    "save-as-template": () => {
      if (isTemplatePageId(pageId) || currentPage == null) {
        return;
      }
      saveAsTemplate.request();
    },
    // Wrapped: handlers receive the keydown event, which must not leak into
    // duplicate()'s optional withContent parameter.
    "duplicate-page": (event) => {
      event.preventDefault();
      actions.duplicate();
    },
    "new-subpage": () =>
      dispatch({
        parentId: pageId,
        title: DEFAULT_PAGE_TITLE,
        type: "page.create",
      }),
    "next-page": () => goToAdjacent(1),
    "prev-page": () => goToAdjacent(-1),
    "toggle-full-width": () => setFullWidth(!fullWidth),
    "toggle-favorite": () => {
      toggleFavorite(pageId);
    },
  });

  return (
    <>
      <DeletePageConfirmDialog
        onConfirm={() => {
          actions.deletePage();
          setDeleteOpen(false);
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        pageId={pageId}
      />

      <Dialog
        onOpenChange={saveAsTemplate.setConfirmOpen}
        open={saveAsTemplate.confirmOpen}
      >
        <DialogContent
          onKeyDownCapture={createConfirmDialogKeyDownHandler({
            onCancel: () => saveAsTemplate.setConfirmOpen(false),
            onConfirm: saveAsTemplate.confirm,
          })}
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Replace existing template?</DialogTitle>
            <DialogDescription>
              A page template already exists. Saving “
              {currentPage?.title ?? DEFAULT_PAGE_TITLE}” as the template
              overwrites its content and settings. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <ConfirmDialogFooter
            confirmLabel="Replace template"
            confirmVariant="default"
            onCancel={() => saveAsTemplate.setConfirmOpen(false)}
            onConfirm={saveAsTemplate.confirm}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Page-scoped keyboard commands (duplicate/delete/copy-link, sub-page, full
 * width, cover, and prev/next page). Mounted inside the page workspace — and
 * inside {@link PageCoverProvider} so `add-cover` can open the shared picker.
 * Client-only.
 */
export function PageCommandHotkeys(props: PageCommandHotkeysProps) {
  const isClient = useIsClient();
  return isClient ? <PageCommandHotkeysLive {...props} /> : null;
}
