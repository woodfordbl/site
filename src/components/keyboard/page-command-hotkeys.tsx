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
import { readPageListExpandedIdsFromDocument } from "@/lib/pages/page-list-expanded-cookie.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";
import { resolveAdjacentSidebarPageId } from "@/lib/pages/resolve-sidebar-nav-page-ids.ts";
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

  // Only truly global page commands live here. The contextual actions
  // (favorite/duplicate/delete/save-as-template/edit-template) are `scope: "menu"`
  // — bare single keys dispatched by useMenuCommandKeys while their action menu
  // is open, so they act on that menu's target instead of the active page.
  useCommandHotkeys({
    "add-cover": () => cover?.openPicker(),
    "copy-page-link": () => {
      actions.copyLink().catch(() => undefined);
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
  });

  return null;
}

/**
 * Page-scoped global keyboard commands (copy-link, sub-page, full width, cover,
 * and prev/next page). Mounted inside the page workspace — and inside
 * {@link PageCoverProvider} so `add-cover` can open the shared picker.
 * Client-only.
 */
export function PageCommandHotkeys(props: PageCommandHotkeysProps) {
  const isClient = useIsClient();
  return isClient ? <PageCommandHotkeysLive {...props} /> : null;
}
