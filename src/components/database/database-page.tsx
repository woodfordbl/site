import {
  IconDatabase,
  IconDatabaseOff,
  IconHome,
  IconLayoutSidebar,
  IconSlash,
} from "@tabler/icons-react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";

import { DatabaseTableView } from "@/components/database/database-table-view.tsx";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageBreadcrumbAncestorCrumb } from "@/components/pages/page-breadcrumb-ancestor-crumb.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
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
import {
  localBlocksCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { findDatabaseHostPageId } from "@/lib/databases/resolve-database-host-page.ts";
import { getAncestorPageIds } from "@/lib/pages/build-page-tree.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

/**
 * The standalone database page (`/db/$databaseId`): a dedicated area for one
 * workspace database, distinct from the same database embedded in a page's
 * `database` block. Client-only (data lives only in localStorage); resolves
 * the database from the local collection and renders the shared
 * {@link DatabaseTableView} in edit mode. View switching uses the table view's
 * ephemeral per-mount state — there is no block to persist onto, and view
 * DEFINITIONS stay on the one database entity (linked surfaces share them).
 */

export interface DatabasePageProps {
  databaseId: string;
}

/** Client-only route body: resolves the database from the local collection. */
export function DatabasePage({ databaseId }: DatabasePageProps): ReactNode {
  const { data: databases = [], isReady } = useLiveQuery(
    (query) =>
      query
        .from({ database: localDatabasesCollection })
        .where(({ database }) => eq(database.id, databaseId)),
    [databaseId]
  );
  const database = databases[0];

  // Neutral shell while the local collection hydrates — same "no content
  // flash" contract as the `/db/$databaseId/$rowId` row route.
  if (!isReady) {
    return <SiteShell>{null}</SiteShell>;
  }

  return (
    <SiteShell>
      <PageSidebarChromeProvider sidebar={<PageSidebar />}>
        {database ? (
          <DatabasePageBody database={database} />
        ) : (
          <DatabasePageNotFoundBody />
        )}
      </PageSidebarChromeProvider>
    </SiteShell>
  );
}

const BREADCRUMB_SEPARATOR = (
  <IconSlash aria-hidden className="size-4 shrink-0 text-muted-foreground/40" />
);

/**
 * Database-page breadcrumb: **host-page ancestors / host page / database**,
 * mirroring the row page's header minus the trailing row crumb. The host page
 * is the page whose canvas contains the `database` block
 * ({@link findDatabaseHostPageId}); its ancestors and itself are navigable
 * (reusing {@link PageBreadcrumbAncestorCrumb}). On narrow viewports the chain
 * collapses to just the database name. When no host page resolves (database
 * not on any locally-edited page) only the database name shows.
 */
function DatabasePageHeader({
  database,
}: {
  database: LocalDatabase;
}): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const { pages } = useMergedPageListItems();

  const hostPageId = useMemo(
    () =>
      findDatabaseHostPageId({
        blocks: localBlocksCollection.toArray,
        databaseId: database.id,
        pages,
      }),
    [database.id, pages]
  );

  const ancestorCrumbs = useMemo(() => {
    if (!hostPageId || isNarrowViewport) {
      return [];
    }
    const chain = [
      ...getAncestorPageIds(hostPageId, pages).reverse(),
      hostPageId,
    ];
    return chain
      .map((id) => pages.find((page) => page.id === id))
      .filter((page): page is NonNullable<typeof page> => Boolean(page));
  }, [hostPageId, isNarrowViewport, pages]);

  return (
    <header className="flex shrink-0 items-center gap-1 border-sidebar-border border-b bg-background px-3 py-1">
      <DatabasePageSidebarToggle />
      <nav
        aria-label="Breadcrumb"
        className="flex h-8 min-w-0 flex-1 items-center gap-0.5 text-muted-foreground text-sm"
      >
        {ancestorCrumbs.map((ancestor) => (
          <span className="contents" key={ancestor.id}>
            <PageBreadcrumbAncestorCrumb
              activePageId={hostPageId ?? ancestor.id}
              ancestor={ancestor}
              pages={pages}
            />
            {BREADCRUMB_SEPARATOR}
          </span>
        ))}
        <span className="flex min-w-0 shrink-0 items-center gap-1.5 px-1.5 text-foreground">
          {database.icon ? (
            <PageIconDisplay className="[&_svg]:size-4" icon={database.icon} />
          ) : (
            <IconDatabase className="size-4 shrink-0 stroke-[1.5px]" />
          )}
          <span className="max-w-64 truncate">{database.name}</span>
        </span>
      </nav>
    </header>
  );
}

/** Desktop: expand button only when collapsed. Mobile: sheet trigger. */
function DatabasePageSidebarToggle(): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const { isCollapsed, pinSidebar } = usePageSidebarChrome();

  if (isNarrowViewport) {
    return <SidebarTrigger className="shrink-0 text-muted-foreground" />;
  }
  if (!isCollapsed) {
    return null;
  }
  return (
    <Button
      aria-label="Expand sidebar"
      className="shrink-0"
      onClick={pinSidebar}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <IconLayoutSidebar aria-hidden />
    </Button>
  );
}

function DatabasePageBody({
  database,
}: {
  database: LocalDatabase;
}): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const { isCollapsed } = usePageSidebarChrome();
  const showSidebarRail = !(isNarrowViewport || isCollapsed);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:h-auto md:h-full">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none">
        {showSidebarRail ? <PageSidebarRail /> : null}
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col border border-border bg-background max-md:flex-none max-md:overflow-visible max-md:border-0 md:overflow-hidden md:rounded-xl"
          data-page-main-panel=""
        >
          <DatabasePageHeader database={database} />
          {/*
            Left padding matches the table's select-lane bleed (`-ml-12` /
            `SELECTION_COLUMN_WIDTH_PX`) so hover/number checkboxes sit in the
            gutter without being clipped by the panel's `overflow-hidden`.
          */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-4 pl-12 md:p-6 md:pl-12">
            <DatabaseTableView
              databaseId={database.id}
              fillHeight
              mode="edit"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Database not found" empty state inside the normal shell. */
function DatabasePageNotFoundBody(): ReactNode {
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
    </div>
  );
}
