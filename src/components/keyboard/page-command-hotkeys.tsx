"use client";

import { useNavigate } from "@tanstack/react-router";

import { useCommandHotkeys } from "@/components/keyboard/use-command-hotkeys.ts";
import { usePageCover } from "@/components/pages/page-cover-context.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { usePageActions } from "@/hooks/use-page-actions.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { usePageSettings } from "@/hooks/use-page-settings.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";
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
  const cover = usePageCover();
  const { fullWidth, setFullWidth } = usePageSettings({
    pageId,
    seed,
    serverPage,
  });

  // Step to the previous/next page in sidebar order, wrapping is intentionally
  // avoided (no-op at the ends).
  const goToAdjacent = (delta: number) => {
    const index = pages.findIndex((candidate) => candidate.id === pageId);
    if (index === -1) {
      return;
    }
    const target = pages[index + delta];
    if (target) {
      navigate(resolvePageNavTarget(target.id, pages));
    }
  };

  useCommandHotkeys({
    "add-cover": () => cover?.openPicker(),
    "copy-page-link": () => {
      actions.copyLink().catch(() => undefined);
    },
    "delete-page": () => {
      if (actions.canDelete) {
        actions.deletePage();
      }
    },
    // Wrapped: handlers receive the keydown event, which must not leak into
    // duplicate()'s optional withContent parameter.
    "duplicate-page": () => actions.duplicate(),
    "new-subpage": () =>
      dispatch({
        parentId: pageId,
        title: DEFAULT_PAGE_TITLE,
        type: "page.create",
      }),
    "next-page": () => goToAdjacent(1),
    "prev-page": () => goToAdjacent(-1),
    "toggle-full-width": () => setFullWidth(!fullWidth),
  });

  return null;
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
