import { IconDatabaseOff, IconHome } from "@tabler/icons-react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { DatabaseTableView } from "@/components/database/database-table-view.tsx";
import { HubPageTitleSlot } from "@/components/database/hub-page-title-slot.tsx";
import { useCommandHotkeys } from "@/components/keyboard/use-command-hotkeys.ts";
import { useIsNarrowViewport } from "@/components/layout/device-layout-provider.tsx";
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
import {
  localBlocksCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { isNonCanvasEditableFocused } from "@/lib/canvas/canvas-keyboard-shortcuts.ts";
import {
  getLastDatabaseRowEditRecordedAt,
  tryRedoDatabaseRowEdit,
  tryUndoDatabaseRowEdit,
} from "@/lib/databases/database-row-edit-history.ts";
import {
  getLastDatabaseViewEditRecordedAt,
  getLastSessionUndoKind,
  tryRedoDatabaseViewEdit,
  tryUndoDatabaseViewEdit,
} from "@/lib/databases/database-view-edit-history.ts";
import {
  ensureDatabaseHubContent,
  ensureDatabaseHubPage,
  findHubDatabaseBlock,
  setHubDatabaseBlockViewId,
  syncHubPageMetadataFromDatabase,
} from "@/lib/databases/ensure-database-hub-page.ts";
import { useShippedDatabasesSettled } from "@/lib/databases/shipped-databases-settled.ts";
import type { DatabaseProps } from "@/lib/schemas/block-props.ts";

export interface DatabaseHubPageProps {
  databaseId: string;
}

/**
 * Database hub URL: seed a hub page (ghost linked `database` block for
 * `viewId`) then render {@link PageWorkspace} with a full-page
 * {@link DatabaseTableView} — no canvas / other blocks. Cover and header menu
 * match any other page.
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

/** Hub page already resolved — full-page database view, no canvas. */
export function DatabaseHubPageWorkspace({
  pageId,
}: {
  pageId: string;
}): ReactNode {
  const page = useLocalPageById(pageId);
  const source = page?.databaseSource;
  const databaseId = source?.databaseId ?? "";

  const { data: databases = [] } = useLiveQuery(
    (query) =>
      query
        .from({ database: localDatabasesCollection })
        .where(({ database }) => eq(database.id, databaseId)),
    [databaseId]
  );
  const database = databases[0];

  // Re-read the ghost block when blocks for this page change (viewId writes).
  const { data: pageBlocks = [] } = useLiveQuery(
    (query) =>
      query
        .from({ block: localBlocksCollection })
        .where(({ block }) => eq(block.pageId, pageId)),
    [pageId]
  );

  useEffect(() => {
    if (!(page && source && database)) {
      return;
    }
    ensureDatabaseHubContent(page.id, source.databaseId);
    syncHubPageMetadataFromDatabase(page.id, database);
  }, [database, page, source]);

  const ghostBlock =
    database &&
    (findHubDatabaseBlock(pageId, database.id) ??
      pageBlocks.find(
        (block) =>
          block.type === "database" &&
          (block.props as DatabaseProps).databaseId === database.id
      ));
  const viewId =
    ghostBlock && typeof ghostBlock.props === "object" && ghostBlock.props
      ? (ghostBlock.props as DatabaseProps).viewId
      : undefined;

  const handleViewIdChange = useCallback(
    (nextViewId: string) => {
      if (!database) {
        return;
      }
      setHubDatabaseBlockViewId(pageId, database.id, nextViewId);
    },
    [database, pageId]
  );

  // Hub pages have no canvas editor, so session undo for view options and
  // row deletions is registered here. Text fields keep native undo.
  useCommandHotkeys({
    "undo-edit": (event) => {
      if (isNonCanvasEditableFocused()) {
        return;
      }
      const databaseRowsAt = getLastDatabaseRowEditRecordedAt();
      const databaseViewAt = getLastDatabaseViewEditRecordedAt();
      if (databaseRowsAt >= databaseViewAt && tryUndoDatabaseRowEdit()) {
        event.preventDefault();
        return;
      }
      if (tryUndoDatabaseViewEdit()) {
        event.preventDefault();
      }
    },
    "redo-edit": (event) => {
      if (isNonCanvasEditableFocused()) {
        return;
      }
      const undoKind = getLastSessionUndoKind();
      switch (undoKind) {
        case "database-rows":
          if (tryRedoDatabaseRowEdit()) {
            event.preventDefault();
          }
          break;
        case "database-view":
          if (tryRedoDatabaseViewEdit()) {
            event.preventDefault();
          }
          break;
        case "page-blocks":
        case null:
          break;
        default: {
          const _exhaustive: never = undoKind;
          throw new Error(`Unhandled session undo kind: ${_exhaustive}`);
        }
      }
    },
  });

  if (!(page && source && database)) {
    return null;
  }

  return (
    <PageWorkspace
      bodySlot={
        <DatabaseTableView
          databaseId={database.id}
          fillHeight
          hideTitle
          mode="edit"
          onViewIdChange={handleViewIdChange}
          viewId={viewId}
        />
      }
      kind="user"
      page={page}
      pageHasLocalDraft
      titleSlot={<HubPageTitleSlot database={database} pageId={page.id} />}
    />
  );
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
