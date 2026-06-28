import { IconFileOff, IconHome } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageSidebar } from "@/components/pages/page-sidebar.tsx";
import {
  PageSidebarChromeProvider,
  usePageSidebarChrome,
} from "@/components/pages/page-sidebar-chrome.tsx";
import { PageSidebarRail } from "@/components/pages/page-sidebar-rail.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { SidebarTrigger } from "@/components/ui/sidebar.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";

export function NotFoundPage() {
  return (
    <SiteShell>
      <PageSidebarChromeProvider sidebar={<PageSidebar />}>
        <NotFoundPageBody />
      </PageSidebarChromeProvider>
    </SiteShell>
  );
}

function NotFoundPageBody() {
  const isNarrowViewport = useIsNarrowViewport();
  const { isCollapsed } = usePageSidebarChrome();
  const showSidebarRail = !(isNarrowViewport || isCollapsed);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {showSidebarRail ? <PageSidebarRail /> : null}
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border bg-background max-md:border-0 md:rounded-xl"
          data-page-main-panel=""
        >
          {isNarrowViewport ? (
            <div className="flex shrink-0 items-center px-4 py-2 md:hidden">
              <SidebarTrigger className="shrink-0 text-muted-foreground" />
            </div>
          ) : null}
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconFileOff />
                </EmptyMedia>
                <EmptyTitle>Page not found</EmptyTitle>
                <EmptyDescription>
                  This page doesn't exist or may have been moved.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button render={<Link to="/" />}>
                  <IconHome />
                  Go home
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        </div>
      </div>
    </div>
  );
}
