"use client";

import { IconSettings } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { DEFAULT_SETTINGS_SECTION } from "@/components/settings/site-settings-sections.ts";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { isActivePage, useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";

/**
 * Opens site settings from the bottom of the page sidebar. The canvas footer
 * settings button is hidden on mobile, so this gives narrow viewports a way to
 * reach settings; it carries the active page id (when resolvable) plus a
 * `returnTo` so the back action lands on the current page.
 */
export function PageSidebarSettingsAction() {
  const active = useActivePageRef();
  const { pages } = useMergedPageListItems();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const pageId = useMemo(() => {
    const match = pages.find((page) =>
      isActivePage(page.id, page.slug, active)
    );
    return match?.id ?? "";
  }, [active, pages]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="text-sidebar-foreground/70"
        render={
          <Link
            params={{ section: DEFAULT_SETTINGS_SECTION }}
            search={{ pageId, returnTo: pathname }}
            to="/settings/$section"
          />
        }
      >
        <IconSettings aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Settings</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
