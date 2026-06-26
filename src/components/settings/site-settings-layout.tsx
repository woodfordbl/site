"use client";

import { Outlet, useRouterState } from "@tanstack/react-router";

import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageSidebarChromeProvider } from "@/components/pages/page-sidebar-chrome.tsx";
import { SiteSettingsSidebar } from "@/components/settings/site-settings-sidebar.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";
import { cn } from "@/lib/utils.ts";

interface SiteSettingsLayoutProps {
  search: SettingsSearch;
}

function SettingsMainInset({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex h-full min-h-0 min-w-0 flex-1 flex-col", className)}
    >
      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border bg-background max-md:border-0 md:rounded-xl"
        data-page-main-panel=""
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className="h-full min-h-0 flex-1" fadeEdges>
            <Outlet />
          </ScrollArea>
        </div>
      </div>
      {/* Matches PageWorkspaceBody footer lane height so the inset card aligns with pages. */}
      <div aria-hidden className="h-9 shrink-0" />
    </div>
  );
}

export function SiteSettingsLayout({ search }: SiteSettingsLayoutProps) {
  const isNarrow = useIsNarrowViewport();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isSettingsIndex = pathname === "/settings" || pathname === "/settings/";
  const showNav = !isNarrow || isSettingsIndex;
  const showPanel = !(isNarrow && isSettingsIndex);
  const sidebar = <SiteSettingsSidebar search={search} />;

  if (isNarrow) {
    return (
      <SiteShell>
        <SidebarProvider className="flex h-full min-h-0 w-full flex-col">
          <div className="flex h-full min-h-0 w-full flex-col">
            {showNav ? sidebar : null}
            <SettingsMainInset className={showPanel ? undefined : "hidden"} />
          </div>
        </SidebarProvider>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <PageSidebarChromeProvider sidebar={sidebar}>
        <SettingsMainInset />
      </PageSidebarChromeProvider>
    </SiteShell>
  );
}
