import { IconDatabaseOff, IconFileText, IconHome } from "@tabler/icons-react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef } from "react";

import { CanvasBlocksReadOnly } from "@/components/canvas/page-canvas-server.tsx";
import { RowPropertiesPanel } from "@/components/database/row-page/row-properties-panel.tsx";
import {
  RowPropertiesRailLayout,
  useRowPropertiesRail,
} from "@/components/database/row-page/row-properties-rail.tsx";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
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
import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { useRowTemplate } from "@/hooks/use-row-template.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import { resolveDatabaseRowPageTitle } from "@/lib/databases/database-row-page-title.ts";
import { ensureDatabaseRowPage } from "@/lib/databases/materialize-row-page.ts";
import { instantiateTemplateBlocks } from "@/lib/databases/row-template.ts";
import { pageContentTypographyProps } from "@/lib/pages/page-content-typography.ts";
import {
  pageTitleEditorLayoutClassName,
  pageTitleIconSlotClassName,
} from "@/lib/pages/page-title-layout.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { resolvePageFont } from "@/lib/schemas/page-settings.ts";
import { cn } from "@/lib/utils.ts";

export interface DatabaseRowPageProps {
  databaseId: string;
  rowId: string;
}

/**
 * Resolves a row URL into either its materialized `PageWorkspace` or, for
 * synced rows, the immutable template-backed view. Local rows seed once on
 * open so the normal page menu is available before the user interacts.
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
    if (
      !(database && row) ||
      row.externalId ||
      row.pageId ||
      seededRowRef.current === row.id
    ) {
      return;
    }

    seededRowRef.current = row.id;
    ensureDatabaseRowPage({
      database,
      dispatch,
      navigate: false,
      pages,
      row,
    }).catch(() => undefined);
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

  if (row.externalId) {
    return <SyncedDatabaseRowPage database={database} row={row} />;
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
  const rail = useRowPropertiesRail(database);

  if (!(page && source && database && row)) {
    return null;
  }

  return (
    <PageWorkspace
      contentWrapper={
        rail.panelMode
          ? (canvasRegion) => (
              <RowPropertiesRailLayout
                database={database}
                panel={<RowPropertiesPanel database={database} row={row} />}
              >
                {canvasRegion}
              </RowPropertiesRailLayout>
            )
          : undefined
      }
      kind="user"
      page={page}
      pageHasLocalDraft
    />
  );
}

function SyncedDatabaseRowPage({
  database,
  row,
}: {
  database: LocalDatabase;
  row: LocalDatabaseRow;
}): ReactNode {
  return (
    <SiteShell>
      <PageSidebarChromeProvider sidebar={<PageSidebar />}>
        <SyncedDatabaseRowPageBody database={database} row={row} />
      </PageSidebarChromeProvider>
    </SiteShell>
  );
}

function SyncedDatabaseRowPageBody({
  database,
  row,
}: {
  database: LocalDatabase;
  row: LocalDatabaseRow;
}): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const rail = useRowPropertiesRail(database);
  const template = useRowTemplate(database.id);
  const title = resolveDatabaseRowPageTitle(database, row);
  const templateBlocks = useMemo(
    () =>
      instantiateTemplateBlocks(template?.blocks, database.fields, row.values, {
        now: () => new Date(),
      }),
    [database.fields, row.values, template?.blocks]
  );
  const canvasRegion = (
    <div
      {...pageContentTypographyProps({
        font: resolvePageFont(template?.font),
        textScale: undefined,
      })}
      className="flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden"
    >
      <CanvasBlocksReadOnly
        blocks={templateBlocks}
        isNarrowViewport={isNarrowViewport}
        mode="view"
        pageId={`db-row:${row.id}`}
        titleSlot={
          <RowPageTitleSection
            database={database}
            displayTitle={title}
            icon={template?.icon}
            row={row}
            showProperties={!rail.panelMode}
          />
        }
      />
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:h-auto md:h-full">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col border border-border bg-background max-md:flex-none max-md:overflow-visible max-md:border-0 md:overflow-hidden md:rounded-xl"
          data-page-main-panel=""
        >
          {rail.panelMode ? (
            <RowPropertiesRailLayout
              database={database}
              panel={<RowPropertiesPanel database={database} row={row} />}
            >
              {canvasRegion}
            </RowPropertiesRailLayout>
          ) : (
            canvasRegion
          )}
        </div>
      </div>
      <PageInsetFooter />
    </div>
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

/** Shared read-only title used by synced rows and template previews. */
export function RowPageTitleSection({
  database,
  displayTitle,
  icon,
  propertiesExtra,
  row,
  showProperties = true,
}: {
  database: LocalDatabase;
  displayTitle: string;
  icon?: string;
  propertiesExtra?: ReactNode;
  row: LocalDatabaseRow;
  showProperties?: boolean;
}): ReactNode {
  return (
    <div>
      <div className={pageTitleEditorLayoutClassName}>
        <div className={pageTitleIconSlotClassName}>
          <span className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground sm:size-9">
            {icon ? (
              <PageIconDisplay
                className="text-[26px] [&_svg]:size-7"
                icon={icon}
              />
            ) : (
              <IconFileText aria-hidden className="size-7 stroke-[1.5px]" />
            )}
          </span>
        </div>
        <h1
          className={cn(
            "w-full min-w-0",
            headingSurfaceClassName,
            headingTypographyClassNames[1]
          )}
        >
          {displayTitle}
        </h1>
      </div>
      {showProperties ? (
        <div
          className="relative mt-6 mb-4 border-border border-b pb-3"
          data-reveal-group=""
        >
          {propertiesExtra ? (
            <div className="absolute top-0 right-0 z-10">{propertiesExtra}</div>
          ) : null}
          <RowPropertiesPanel database={database} row={row} />
        </div>
      ) : null}
    </div>
  );
}
