import { IconDatabase } from "@tabler/icons-react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import {
  localBlocksCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { pageListRowPaddingLeft } from "@/lib/pages/page-list-preview-depth.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";

/**
 * Sidebar presence for databases: a page hosting a `database` block gets a
 * child row per hosted database (icon + name) under it in the page tree.
 * Materialized row pages are hidden from the sidebar (`databaseRowSource`),
 * so this entry is the database's navigation surface. v1 navigates to the
 * HOST page (scroll-to-block arrives later). Synthetic rows only — nothing
 * is inserted into the page collections; no context menu, drag, or chevron.
 *
 * Client-only data: the scan reads the local block/database collections, so
 * SSR paints no database rows and they appear after hydration (`useIsClient`
 * keeps the hydration render identical to SSR).
 */
export interface HostedDatabaseSidebarEntry {
  icon?: string;
  id: string;
  name: string;
}

type HostedDatabasesByPage = ReadonlyMap<string, HostedDatabaseSidebarEntry[]>;

const EMPTY_MAP: HostedDatabasesByPage = new Map();
const NO_ENTRIES: HostedDatabaseSidebarEntry[] = [];

const HostedDatabasesContext = createContext<HostedDatabasesByPage>(EMPTY_MAP);

function readBlockDatabaseId(props: unknown): string | undefined {
  if (typeof props !== "object" || props === null) {
    return;
  }
  const { databaseId } = props as { databaseId?: unknown };
  return typeof databaseId === "string" && databaseId !== ""
    ? databaseId
    : undefined;
}

/** Computes the pageId → hosted databases map once for the whole sidebar. */
export function HostedDatabasesProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const isClient = useIsClient();
  const { data: databaseBlocks = [] } = useLiveQuery((query) =>
    query
      .from({ block: localBlocksCollection })
      .where(({ block }) => eq(block.type, "database"))
  );
  const { data: databases = [] } = useLiveQuery((query) =>
    query.from({ database: localDatabasesCollection })
  );

  const byPage = useMemo<HostedDatabasesByPage>(() => {
    if (!isClient) {
      return EMPTY_MAP;
    }

    const databasesById = new Map(
      databases.map((database) => [database.id, database])
    );
    const map = new Map<string, HostedDatabaseSidebarEntry[]>();
    const seen = new Set<string>();

    for (const block of databaseBlocks) {
      const databaseId = readBlockDatabaseId(block.props);
      const database = databaseId ? databasesById.get(databaseId) : undefined;
      if (!database) {
        continue;
      }
      const key = `${block.pageId}:${database.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const entries = map.get(block.pageId) ?? [];
      entries.push({
        icon: database.icon,
        id: database.id,
        name: database.name,
      });
      map.set(block.pageId, entries);
    }

    for (const entries of map.values()) {
      entries.sort(
        (left, right) =>
          left.name.localeCompare(right.name, undefined, {
            sensitivity: "base",
          }) || left.id.localeCompare(right.id)
      );
    }

    return map;
  }, [databaseBlocks, databases, isClient]);

  return (
    <HostedDatabasesContext.Provider value={byPage}>
      {children}
    </HostedDatabasesContext.Provider>
  );
}

/** Databases hosted on one page (empty outside a provider / before hydration). */
export function useHostedDatabases(
  pageId: string
): HostedDatabaseSidebarEntry[] {
  return useContext(HostedDatabasesContext).get(pageId) ?? NO_ENTRIES;
}

function PageListDatabaseRow({
  database,
  depth,
  hostPageId,
  pages,
}: {
  database: HostedDatabaseSidebarEntry;
  depth: number;
  hostPageId: string;
  pages: PageSummary[];
}): ReactNode {
  const navigate = useNavigate();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={pageListRowPaddingLeft(depth)}
        onClick={() => {
          navigate(resolvePageNavTarget(hostPageId, pages));
        }}
      >
        <span className={iconSlotClassName("icon-xs", "relative size-4")}>
          {database.icon ? (
            <PageIconDisplay icon={database.icon} />
          ) : (
            <IconDatabase className="size-4 stroke-[1.5px]" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-left">
          {database.name}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** All hosted-database rows for one host page, rendered after its child pages. */
export function PageListDatabaseRows({
  depth,
  hostPageId,
  pages,
}: {
  depth: number;
  hostPageId: string;
  pages: PageSummary[];
}): ReactNode {
  const entries = useHostedDatabases(hostPageId);

  if (entries.length === 0) {
    return null;
  }

  return entries.map((database) => (
    <PageListDatabaseRow
      database={database}
      depth={depth}
      hostPageId={hostPageId}
      key={database.id}
      pages={pages}
    />
  ));
}
