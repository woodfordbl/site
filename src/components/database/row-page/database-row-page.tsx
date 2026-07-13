import { IconDatabaseOff, IconHome } from "@tabler/icons-react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef } from "react";
import { RowPageTitleSlot } from "@/components/database/row-page/row-page-title-slot.tsx";
import { RowPropertiesPanel } from "@/components/database/row-page/row-properties-panel.tsx";
import { useRowPageWorkspaceChrome } from "@/components/database/row-page/row-properties-rail.tsx";
import { SiteShell } from "@/components/layout/site-shell.tsx";
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
import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { ensureDatabaseRowPage } from "@/lib/databases/materialize-row-page.ts";

export interface DatabaseRowPageProps {
  databaseId: string;
  rowId: string;
}

/**
 * Resolves a row URL into a seeded `PageWorkspace` (local and connector-synced
 * rows). Seeds once on open so cover, breadcrumb, and the page menu match
 * ordinary pages; the properties rail is the only database-specific chrome.
 */
export function DatabaseRowPage({
  databaseId,
  rowId,
}: DatabaseRowPageProps): ReactNode {
  const { data: databases = [], isReady: databasesReady } = useLiveQuery(
    (query) =>
      query
        .from({ database: localDatabasesCollection })
        .where(({ database }) => eq(database.id, databaseId)),
    [databaseId]
  );
  const { data: rows = [], isReady: rowsReady } = useLiveQuery(
    (query) =>
      query
        .from({ row: localDatabaseRowsCollection })
        .where(({ row }) => eq(row.id, rowId)),
    [rowId]
  );
  const database = databases[0];
  const row = rows.find((entry) => entry.databaseId === databaseId);
  const linkedPage = useLocalPageById(row?.pageId ?? "");
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);
  const seededRowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!(database && row) || row.pageId || seededRowRef.current === row.id) {
      return;
    }

    seededRowRef.current = row.id;
    ensureDatabaseRowPage({
      database,
      dispatch,
      navigate: false,
      pages,
      row,
    }).catch(() => {
      seededRowRef.current = null;
    });
  }, [database, dispatch, pages, row]);

  if (!(databasesReady && rowsReady)) {
    return <SiteShell>{null}</SiteShell>;
  }

  if (!(database && row)) {
    return <RowPageNotFound />;
  }

  if (linkedPage) {
    return (
      <SiteShell>
        <DatabaseRowPageWorkspace pageId={linkedPage.id} />
      </SiteShell>
    );
  }

  // Wait for the optimistic page.create + row link to reach both local
  // collections. Do not re-seed a dangling link; ensure runs once per open.
  return <SiteShell>{null}</SiteShell>;
}

/**
 * Materialized row pages use the complete normal-page workspace. The source
 * marker provides the database and row for the properties rail without making
 * the page itself a special editor surface.
 */
export function DatabaseRowPageWorkspace({
  pageId,
}: {
  pageId: string;
}): ReactNode {
  const page = useLocalPageById(pageId);
  const source = page?.databaseRowSource;
  const { data: databases = [] } = useLiveQuery(
    (query) =>
      query
        .from({ database: localDatabasesCollection })
        .where(({ database }) => eq(database.id, source?.databaseId ?? "")),
    [source?.databaseId]
  );
  const { data: rows = [] } = useLiveQuery(
    (query) =>
      query
        .from({ row: localDatabaseRowsCollection })
        .where(({ row }) => eq(row.id, source?.rowId ?? "")),
    [source?.rowId]
  );
  const database = databases[0];
  const row = rows.find((entry) => entry.databaseId === source?.databaseId);
  const chrome = useRowPageWorkspaceChrome(database, {
    propertiesPanel:
      database && row ? (
        <RowPropertiesPanel database={database} row={row} />
      ) : null,
  });

  if (!(page && source && database && row)) {
    return null;
  }

  return (
    <PageWorkspace
      contentWrapper={chrome.contentWrapper}
      kind="user"
      page={page}
      pageHasLocalDraft
      titleSlot={<RowPageTitleSlot database={database} page={page} row={row} />}
    />
  );
}

function RowPageNotFound(): ReactNode {
  return (
    <SiteShell>
      <PageSidebarChromeProvider sidebar={<PageSidebar />}>
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center border border-border bg-background p-6 max-md:border-0 md:rounded-xl">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconDatabaseOff />
              </EmptyMedia>
              <EmptyTitle>Row not found</EmptyTitle>
              <EmptyDescription>
                This database row doesn't exist or may have been deleted.
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
      </PageSidebarChromeProvider>
    </SiteShell>
  );
}
