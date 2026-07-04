import {
  IconDatabase,
  IconDatabaseOff,
  IconFileText,
  IconHome,
  IconLayoutSidebar,
  IconSlash,
} from "@tabler/icons-react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { CanvasBlocksReadOnly } from "@/components/canvas/page-canvas-server.tsx";
import { RowPropertiesPanel } from "@/components/database/row-page/row-properties-panel.tsx";
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
  localDatabaseRowsCollection,
  localDatabasesCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { setDatabaseRowPageId } from "@/db/queries/database-collection-ops.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import { cellToPlainText } from "@/lib/databases/cell-values.ts";
import {
  findDatabaseHostPageId,
  resolveDatabaseHostParentId,
} from "@/lib/databases/resolve-database-host-page.ts";
import { instantiateTemplateBlocks } from "@/lib/databases/row-template.ts";
import { getAncestorPageIds } from "@/lib/pages/build-page-tree.ts";
import { clonePageBlocks } from "@/lib/pages/clone-page-blocks.ts";
import {
  pageTitleEditorLayoutClassName,
  pageTitleIconSlotClassName,
} from "@/lib/pages/page-title-layout.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The virtual row page (`/db/$databaseId/$rowId`): a database row rendered
 * as a page WITHOUT any per-row page storage. The body renders from the
 * database's shared `rowTemplate` (tokens evaluated per render against the
 * row's live values); the title is the primary field's value; properties
 * edit inline through the same collection ops as the grid. The page reads as
 * a normal blank page (no "Edit page" affordance); a REAL user page
 * materializes copy-on-write the first time the user clicks into the body —
 * see {@link useMaterializeRowPage} — after which the route redirects to it.
 *
 * Works identically for synced databases: a GitHub PR table's thousands of
 * rows each "have" a templated page with zero stored blocks. Synced rows
 * (those carrying an `externalId`) never materialize, though — the sync
 * engine owns their lifecycle — so the body click is inert for them.
 */

/** Title shown (and used for the materialized page) when the primary cell is empty. */
const ROW_PAGE_FALLBACK_TITLE = "Untitled";

export interface DatabaseRowPageProps {
  databaseId: string;
  rowId: string;
}

/** Client-only route body: resolves the database + row from local collections. */
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

  // Neutral shell while the local collections hydrate — same "no content
  // flash" contract as the `/p/$` user-page route.
  if (!(databasesReady && rowsReady)) {
    return <SiteShell>{null}</SiteShell>;
  }

  if (!(database && row)) {
    return <RowPageNotFound />;
  }

  return (
    <SiteShell>
      <PageSidebarChromeProvider sidebar={<PageSidebar />}>
        <RowPageBody database={database} row={row} />
      </PageSidebarChromeProvider>
    </SiteShell>
  );
}

/** "Row not found" empty state inside the normal shell (sidebar stays usable). */
function RowPageNotFound(): ReactNode {
  return (
    <SiteShell>
      <PageSidebarChromeProvider sidebar={<PageSidebar />}>
        <RowPageNotFoundBody />
      </PageSidebarChromeProvider>
    </SiteShell>
  );
}

function RowPageNotFoundBody(): ReactNode {
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
        </div>
      </div>
    </div>
  );
}

const BREADCRUMB_SEPARATOR = (
  <IconSlash aria-hidden className="size-4 shrink-0 text-muted-foreground/40" />
);

/**
 * Row-page breadcrumb: **host-page ancestors / host page / database / row**,
 * mirroring the normal page header's ancestor crumbs. The host page is the
 * page whose canvas contains the `database` block ({@link findDatabaseHostPageId},
 * lexicographically-smallest when a database is embedded on several pages), so
 * a row page reads as nested under its real parent. Ancestor + host crumbs are
 * navigable (reusing {@link PageBreadcrumbAncestorCrumb} with its sibling /
 * children hover menus); the database crumb links back to the host page. On
 * narrow viewports the chain collapses to database / row. When no host page is
 * resolvable (database not on any locally-edited page) the database crumb is
 * non-navigating and no ancestors show — the pre-nesting v1 behavior.
 */
function RowPageHeader({
  database,
  rowTitle,
}: {
  database: LocalDatabase;
  rowTitle: string;
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

  // Host-page ancestors (root-first) plus the host page itself. Collapsed on
  // narrow viewports, matching the normal page header.
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

  const databaseNavTarget = hostPageId
    ? resolvePageNavTarget(hostPageId, pages)
    : null;

  const databaseLabel = (
    <>
      {database.icon ? (
        <PageIconDisplay className="[&_svg]:size-4" icon={database.icon} />
      ) : (
        <IconDatabase className="size-4 shrink-0 stroke-[1.5px]" />
      )}
      <span className="max-w-48 truncate">{database.name}</span>
    </>
  );

  return (
    <header className="flex shrink-0 items-center gap-1 border-sidebar-border border-b bg-background px-3 py-1">
      <RowPageSidebarToggle />
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
        {databaseNavTarget ? (
          <Link
            className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60"
            {...databaseNavTarget}
          >
            {databaseLabel}
          </Link>
        ) : (
          <span className="flex min-w-0 shrink-0 items-center gap-1.5 px-1.5">
            {databaseLabel}
          </span>
        )}
        {BREADCRUMB_SEPARATOR}
        <span className="min-w-0 truncate px-1.5 text-foreground">
          {rowTitle}
        </span>
      </nav>
    </header>
  );
}

/** Desktop: expand button only when collapsed. Mobile: sheet trigger. */
function RowPageSidebarToggle(): ReactNode {
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

/** Poll cadence/budget while confirming the optimistic `page.create` landed. */
const LINK_POLL_INTERVAL_MS = 50;
/** ~5s total — `page.create` includes a page-list fetch before the insert. */
const LINK_POLL_MAX_ATTEMPTS = 100;

/**
 * Adopt the created page onto the row only once the page ACTUALLY exists in
 * the local pages collection — `page.create` is optimistic but async (it
 * awaits the page-list query before inserting), and its failures surface
 * nowhere the caller can await. Linking first would strand a dangling
 * `pageId` on the row when the create fails. Polls the collection directly
 * (not component state) so the link still lands if the create's own
 * navigation unmounts the row page first; gives up after the budget.
 */
function linkRowOncePageExists(
  rowId: string,
  pageId: string,
  onDone: (linked: boolean) => void,
  attempt = 0
): void {
  if (localPagesCollection.get(pageId)) {
    setDatabaseRowPageId(rowId, pageId);
    onDone(true);
    return;
  }
  if (attempt >= LINK_POLL_MAX_ATTEMPTS) {
    onDone(false);
    return;
  }
  window.setTimeout(() => {
    linkRowOncePageExists(rowId, pageId, onDone, attempt + 1);
  }, LINK_POLL_INTERVAL_MS);
}

/**
 * Copy-on-write materialization: instantiate the template with the row's
 * CURRENT values (a snapshot — live tokens inside real pages are a future
 * phase), remap block ids, create a real user page through the standard
 * `page.create` dispatch (which also navigates to it), and link the row via
 * `setDatabaseRowPageId` — create first, link only after the page exists
 * (see {@link linkRowOncePageExists}). Synced rows (`externalId`) never
 * materialize. The page nests under the database's **host page**
 * ({@link resolveDatabaseHostParentId}: local block scan, deterministic
 * first host across linked views, depth-clamped to `MAX_PAGE_DEPTH`) for
 * breadcrumb/depth semantics; the `null` top-level fallback only fires when
 * no host page exists — should be unreachable via the UI, where row pages
 * open from a `database` block. Regardless of parent, the page carries
 * `databaseRowSource`, which keeps it out of the sidebar tree entirely —
 * the database's own sidebar entry is the navigation surface.
 */
function useMaterializeRowPage(
  database: LocalDatabase,
  row: LocalDatabaseRow,
  title: string,
  alreadyLinked: boolean
): () => void {
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);
  const materializingRef = useRef(false);

  return useCallback(() => {
    if (materializingRef.current || alreadyLinked || row.externalId) {
      return;
    }
    materializingRef.current = true;

    const pageId = crypto.randomUUID();
    try {
      const blocks = clonePageBlocks(
        instantiateTemplateBlocks(
          database.rowTemplate,
          database.fields,
          row.values,
          { now: () => new Date() }
        )
      );
      const parentId = resolveDatabaseHostParentId({
        blocks: localBlocksCollection.toArray,
        databaseId: database.id,
        pages,
      });

      dispatch({
        type: "page.create",
        pageId,
        parentId,
        databaseRowSource: { databaseId: database.id, rowId: row.id },
        title,
        initialBlocks: blocks,
      });
    } catch (error) {
      // Template/parent resolution threw before the create was dispatched —
      // re-arm the button and surface the failure.
      materializingRef.current = false;
      reportPersistenceError(error);
      return;
    }

    linkRowOncePageExists(row.id, pageId, (linked) => {
      materializingRef.current = false;
      if (!linked) {
        reportPersistenceError(
          new Error("Row page creation did not complete — row left unlinked")
        );
      }
    });
  }, [
    alreadyLinked,
    database.fields,
    database.id,
    database.rowTemplate,
    dispatch,
    pages,
    row.externalId,
    row.id,
    row.values,
    title,
  ]);
}

function RowPageBody({
  database,
  row,
}: {
  database: LocalDatabase;
  row: LocalDatabaseRow;
}): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const { isCollapsed } = usePageSidebarChrome();
  const showSidebarRail = !(isNarrowViewport || isCollapsed);
  const navigate = useNavigate();
  const { pages } = useMergedPageListItems();

  const primaryField = database.fields.find(
    (field) => field.id === database.primaryFieldId
  );
  const rowTitle = primaryField
    ? cellToPlainText(primaryField, row.values[primaryField.id]).trim()
    : "";
  const displayTitle = rowTitle === "" ? ROW_PAGE_FALLBACK_TITLE : rowTitle;

  // A linked page that actually exists wins over the virtual render. A
  // DANGLING pageId (page deleted, or the create not yet applied) keeps the
  // virtual page on screen — never a broken redirect.
  const linkedPage = row.pageId
    ? pages.find((page) => page.id === row.pageId)
    : undefined;

  useEffect(() => {
    if (linkedPage) {
      navigate({
        ...resolvePageNavTarget(linkedPage.id, pages),
        replace: true,
      });
    }
  }, [linkedPage, navigate, pages]);

  const materialize = useMaterializeRowPage(
    database,
    row,
    displayTitle,
    Boolean(linkedPage)
  );

  // Tokens re-evaluate per render, so property edits update the virtual body
  // live — the zero-storage inverse of the materialized snapshot.
  const templateBlocks = useMemo(
    () =>
      instantiateTemplateBlocks(
        database.rowTemplate,
        database.fields,
        row.values,
        { now: () => new Date() }
      ),
    [database.rowTemplate, database.fields, row.values]
  );

  // Clicking anywhere in the read-only body starts editing (Notion's "the
  // page is one click from real"); clicks on interactive elements (links,
  // property editors) are ignored.
  const handleBodyClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest("a, button, input, textarea, [role='dialog']")) {
        return;
      }
      materialize();
    },
    [materialize]
  );

  if (linkedPage) {
    return null;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:h-auto md:h-full">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none">
        {showSidebarRail ? <PageSidebarRail /> : null}
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col border border-border bg-background max-md:flex-none max-md:overflow-visible max-md:border-0 md:overflow-hidden md:rounded-xl"
          data-page-main-panel=""
        >
          <RowPageHeader database={database} rowTitle={displayTitle} />
          {/* biome-ignore lint/a11y/noStaticElementInteractions: whole-body click is a redundant affordance — the Edit page button is the accessible path. */}
          {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — redundant pointer affordance only. */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: same — keyboard users use the Edit page button. */}
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden"
            onClick={handleBodyClick}
          >
            <CanvasBlocksReadOnly
              blocks={templateBlocks}
              isNarrowViewport={isNarrowViewport}
              mode="view"
              pageId={`db-row:${row.id}`}
              titleSlot={
                <RowPageTitleSection
                  database={database}
                  displayTitle={displayTitle}
                  row={row}
                />
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Title + properties section rendered as the read-only canvas's `titleSlot`.
 * Stops click propagation so inline property editing never triggers the
 * body's copy-on-write click handler. There is deliberately no "Edit page"
 * affordance — the page reads as a normal blank page, and clicking into the
 * body starts editing (materializes) silently.
 */
function RowPageTitleSection({
  database,
  displayTitle,
  row,
}: {
  database: LocalDatabase;
  displayTitle: string;
  row: LocalDatabaseRow;
}): ReactNode {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: propagation guard only — interactions live on the controls inside.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: propagation guard only.
    // biome-ignore lint/a11y/useKeyWithClickEvents: propagation guard only — no user-facing click behavior.
    <div
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <div className={pageTitleEditorLayoutClassName}>
        <div className={pageTitleIconSlotClassName}>
          <span className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground sm:size-9">
            <IconFileText aria-hidden className="size-7 stroke-[1.5px]" />
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
      <div className="mt-6 mb-4 border-border border-b pb-3">
        <RowPropertiesPanel database={database} row={row} />
      </div>
    </div>
  );
}
