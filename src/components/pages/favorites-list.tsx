"use client";

import { useMemo } from "react";

import { PageListItem } from "@/components/pages/page-list-item.tsx";
import { SidebarMenu } from "@/components/ui/sidebar.tsx";
import { useFavorites } from "@/hooks/use-favorites.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";

const EMPTY_EXPANDED_IDS = new Set<string>();
const noopToggleExpand = (_pageId: string): void => undefined;

/**
 * Rows for the sidebar Favorites section. Each favorite reuses {@link PageListItem}
 * so it is identical to its entry under Pages — same row, same action dropdown and
 * context menu (the favorite toggle reads "Remove from favorites" here) — but is
 * rendered as a flat row with no children.
 */
export function FavoritesList() {
  const favorites = useFavorites();
  const { pages } = useMergedPageListItems();

  const favoritePages = useMemo(() => {
    const byId = new Map(pages.map((page) => [page.id, page]));
    return favorites
      .map((favorite) => byId.get(favorite.id))
      .filter((page): page is PageSummary => page != null);
  }, [favorites, pages]);

  if (favoritePages.length === 0) {
    return null;
  }

  return (
    <SidebarMenu className="gap-y-px">
      {favoritePages.map((page) => (
        <PageListItem
          depth={0}
          expandedIds={EMPTY_EXPANDED_IDS}
          key={page.id}
          onToggleExpand={noopToggleExpand}
          pages={pages}
          row={{ children: [], page, sortOrder: 0 }}
        />
      ))}
    </SidebarMenu>
  );
}

/** True when at least one favorite resolves to a visible page. */
export function useHasFavorites(): boolean {
  const favorites = useFavorites();
  const { pages } = useMergedPageListItems();

  return useMemo(() => {
    const ids = new Set(pages.map((page) => page.id));
    return favorites.some((favorite) => ids.has(favorite.id));
  }, [favorites, pages]);
}
