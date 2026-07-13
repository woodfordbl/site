import { IconDatabaseOff, IconHome } from "@tabler/icons-react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef } from "react";

import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageInsetFooter } from "@/components/pages/page-inset-footer.tsx";
import { PageSidebar } from "@/components/pages/page-sidebar.tsx";
import { PageSidebarChromeProvider } from "@/components/pages/page-sidebar-chrome.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
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
import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  ensureDatabaseHubContent,
  ensureDatabaseHubPage,
} from "@/lib/databases/ensure-database-hub-page.ts";
import { useShippedDatabasesSettled } from "@/lib/databases/shipped-databases-settled.ts";

export interface DatabaseHubPageProps {
  databaseId: string;
}

/**
 * Database hub URL: seed a normal page (with a linked `database` block) then
 * render {@link PageWorkspace}. Cover, header menu, and settings match any
 * other page — the only database-specific chrome is on row pages (properties).
 */
export function DatabaseHubPage({
  databaseId,
}: DatabaseHubPageProps): ReactNode {
  const { data: databases = [], isReady } = useLiveQuery(
    (query) =>
      query
        .from({ database: localDatabasesCollection })
        .where(({ database }) => eq(database.id, databaseId)),
    [databaseId]
  );
  const shippedSettled = useShippedDatabasesSettled();
  const database = databases[0];
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);
  const hubPage = pages.find(
    (page) => page.databaseSource?.databaseId === databaseId
  );
  const linkedPage = useLocalPageById(hubPage?.id ?? "");
  const seededRef = useRef<string | null>(null);

  useEffect(() => {
    if (!database || seededRef.current === database.id) {
      return;
    }
    if (linkedPage) {
      ensureDatabaseHubContent(linkedPage.id, database.id);
      seededRef.current = database.id;
      return;
    }

    seededRef.current = database.id;
    ensureDatabaseHubPage({ database, dispatch, pages }).catch(() => {
      seededRef.current = null;
    });
  }, [database, dispatch, linkedPage, pages]);

  if (!(isReady && (database || shippedSettled))) {
    return <SiteShell>{null}</SiteShell>;
  }

  if (!database) {
    return (
      <SiteShell>
        <PageSidebarChromeProvider sidebar={<PageSidebar />}>
          <DatabaseHubNotFoundBody />
        </PageSidebarChromeProvider>
      </SiteShell>
    );
  }

  if (linkedPage) {
    return (
      <SiteShell>
        <DatabaseHubPageWorkspace pageId={linkedPage.id} />
      </SiteShell>
    );
  }

  return <SiteShell>{null}</SiteShell>;
}

/** Hub page already resolved — normal workspace, no special header shell. */
export function DatabaseHubPageWorkspace({
  pageId,
}: {
  pageId: string;
}): ReactNode {
  const page = useLocalPageById(pageId);
  const source = page?.databaseSource;

  useEffect(() => {
    if (page && source) {
      ensureDatabaseHubContent(page.id, source.databaseId);
    }
  }, [page, source]);

  if (!(page && source)) {
    return null;
  }

  return <PageWorkspace kind="user" page={page} pageHasLocalDraft />;
}

function DatabaseHubNotFoundBody(): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
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
                  <IconDatabaseOff />
                </EmptyMedia>
                <EmptyTitle>Database not found</EmptyTitle>
                <EmptyDescription>
                  This database doesn't exist or may have been deleted.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button nativeButton={false} render={<Link to="/" />}>
                  <IconHome />
                  Go home
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        </div>
      </div>
      <PageInsetFooter />
    </div>
  );
}
