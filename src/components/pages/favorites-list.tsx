"use client";

import { IconStarOff } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { isActivePage, useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useFavoriteActions, useFavorites } from "@/hooks/use-favorites.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";
import { cn } from "@/lib/utils.ts";

interface FavoriteRowProps {
  page: PageSummary;
  pages: PageSummary[];
}

function FavoriteRow({ page, pages }: FavoriteRowProps) {
  const navigate = useNavigate();
  const activePage = useActivePageRef();
  const { removeFavorite } = useFavoriteActions();
  const navTarget = resolvePageNavTarget(page.id, pages);
  const active = isActivePage(page.id, page.slug, activePage);

  const navigateToPage = () => {
    navigate(navTarget);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <SidebarMenuItem>
      <div
        className={cn(
          "group/favorite-row relative w-full",
          "hover:[&_[data-favorite-row-content]]:bg-sidebar-accent hover:[&_[data-favorite-row-content]]:text-sidebar-accent-foreground"
        )}
        data-reveal-group=""
      >
        <SidebarMenuButton
          data-favorite-row-content=""
          isActive={active}
          render={
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: custom render span for sidebar navigation
            // biome-ignore lint/a11y/noStaticElementInteractions: custom render span for sidebar navigation
            <span
              className="flex w-full min-w-0 select-none items-center gap-2"
              onClick={navigateToPage}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }
                event.preventDefault();
                navigateToPage();
              }}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard navigation for favorite row surface
              tabIndex={0}
            />
          }
          tooltip={page.title}
        >
          <span className={iconSlotClassName("icon-xs", "relative size-4")}>
            <PageIconDisplay icon={page.icon} />
          </span>
          <span className="min-w-0 flex-1 truncate text-left">
            {page.title}
          </span>
        </SidebarMenuButton>
        <SidebarMenuAction
          aria-label={`Remove ${page.title} from favorites`}
          className="hover-reveal hover:bg-sidebar-accent-strong hover:text-sidebar-accent-foreground"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            removeFavorite(page.id);
          }}
          render={<button type="button" />}
        >
          <IconStarOff />
        </SidebarMenuAction>
      </div>
    </SidebarMenuItem>
  );
}

/** Rows for the sidebar Favorites section; render order follows the store. */
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
        <FavoriteRow key={page.id} page={page} pages={pages} />
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
