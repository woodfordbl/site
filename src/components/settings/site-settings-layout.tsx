"use client";

import { Outlet } from "@tanstack/react-router";

import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageMainPanelFooterLane } from "@/components/pages/page-main-panel-footer-lane.tsx";
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:h-auto md:h-full">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none">
        {showSidebarRail ? <PageSidebarRail /> : null}
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col border border-border bg-background max-md:flex-none max-md:overflow-visible max-md:border-0 md:overflow-hidden md:rounded-xl"
          data-page-main-panel=""
        >
          <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden">
            {isNarrowViewport ? (
              // Mobile: render directly so the document is the scroller (content
              // can flow behind the iOS Safari bottom bar and collapse it on
              // scroll). Desktop keeps the inner ScrollArea.
              <Outlet />
            ) : (
              <ScrollArea
                className="h-full min-h-0 flex-1"
                fadeEdges
                viewportClassName="text-foreground"
              >
                <Outlet />
              </ScrollArea>
            )}
          </div>
        </div>
      </div>
      {/* Matches PageWorkspaceBody footer lane height so the inset card aligns
          with pages. Desktop only — on mobile the document scrolls and this lane
          would just add dead space below the content. */}
      <PageMainPanelFooterLane />
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
