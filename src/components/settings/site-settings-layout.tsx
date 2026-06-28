"use client";

import { Outlet } from "@tanstack/react-router";

import { SiteShell } from "@/components/layout/site-shell.tsx";
import {
  PageSidebarChromeProvider,
  useOptionalPageSidebarChrome,
} from "@/components/pages/page-sidebar-chrome.tsx";
import { PageSidebarRail } from "@/components/pages/page-sidebar-rail.tsx";
import { SiteSettingsSidebar } from "@/components/settings/site-settings-sidebar.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";

interface SiteSettingsLayoutProps {
  search: SettingsSearch;
}

function SettingsMainInset() {
  const isNarrowViewport = useIsNarrowViewport();
  const chrome = useOptionalPageSidebarChrome();
  const showSidebarRail = Boolean(
    chrome && !isNarrowViewport && !chrome.isCollapsed
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {showSidebarRail ? <PageSidebarRail /> : null}
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border bg-background max-md:border-0 md:rounded-xl"
          data-page-main-panel=""
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ScrollArea
              className="h-full min-h-0 flex-1"
              fadeEdges
              viewportClassName="text-foreground"
            >
              <Outlet />
            </ScrollArea>
          </div>
        </div>
      </div>
      {/* Matches PageWorkspaceBody footer lane height so the inset card aligns with pages. */}
      <div aria-hidden className="h-9 shrink-0" />
    </div>
  );
}

export function SiteSettingsLayout({ search }: SiteSettingsLayoutProps) {
  const sidebar = <SiteSettingsSidebar search={search} />;

  // Settings shares the page chrome on every viewport: an inset content panel
  // with a sidebar that's pinned on desktop and revealed by the same iOS-style
  // swipe as the page workspace on mobile.
  return (
    <SiteShell>
      <PageSidebarChromeProvider sidebar={sidebar}>
        <SettingsMainInset />
      </PageSidebarChromeProvider>
    </SiteShell>
  );
}
