import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  DatabaseSidebarRow,
  type DatabaseSidebarRowEntry,
} from "@/components/pages/database-sidebar-row.tsx";
import { localBlocksCollection } from "@/db/collections/local-collections.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalDatabasesSnapshot } from "@/hooks/use-local-databases.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";

/**
 * Sidebar presence for databases: a page hosting a `database` block gets a
 * child row per hosted database (icon + name) under it in the page tree.
 * Materialized row pages are hidden from the sidebar (`databaseRowSource`),
 * so this entry is the database's navigation surface. Click opens the
 * standalone database page at `/db/$databaseId` (same as the workspace
 * Databases section). Synthetic rows only — nothing is inserted into the
 * page collections; no drag or chevron. Right-click and the row ⋯ menu
 * mirror the workspace **Databases** section via {@link DatabaseSidebarRow}.
 *
 * Client-only data: the scan reads the local block/database collections, so
 * SSR paints no database rows and they appear after hydration (`useIsClient`
 * keeps the hydration render identical to SSR). The provider renders on every
 * SSR'd page, so it MUST NOT read collections via `useLiveQuery` (no server
 * snapshot → React aborts the whole server render and ships crawlers an empty
 * shell) — see {@link useLocalDatabasesSnapshot} / {@link useDatabaseBlocksSnapshot}.
 */

const SERVER_DATABASE_BLOCKS: LocalBlock[] = [];

/**
 * SSR-safe live view of `database`-type block rows. Maintains the filtered
 * set incrementally from change messages, so a typing burst on text blocks
 * neither rebuilds the set nor re-renders the sidebar.
 */
function useDatabaseBlocksSnapshot(): LocalBlock[] {
  const snapshotRef = useRef<LocalBlock[]>(SERVER_DATABASE_BLOCKS);

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    const byKey = new Map<string | number, LocalBlock>();
    const reseed = () => {
      byKey.clear();
      for (const block of localBlocksCollection.toArray) {
        if (block.type === "database") {
          byKey.set(block.id, block);
        }
      }
      snapshotRef.current = [...byKey.values()];
    };

    reseed();

    const subscription = localBlocksCollection.subscribeChanges((changes) => {
      let changed = false;
      for (const change of changes) {
        if (change.type === "delete") {
          changed = byKey.delete(change.key) || changed;
        } else if (change.value.type === "database") {
          byKey.set(change.key, change.value);
          changed = true;
        } else if (byKey.has(change.key)) {
          byKey.delete(change.key);
          changed = true;
        }
      }
      if (changed) {
        snapshotRef.current = [...byKey.values()];
        onStoreChange();
      }
    });

    if (localBlocksCollection.isReady()) {
      reseed();
      onStoreChange();
    }

    return () => subscription.unsubscribe();
  }, []);

  const getSnapshot = useCallback(() => snapshotRef.current, []);
  const getServerSnapshot = useCallback(() => SERVER_DATABASE_BLOCKS, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

type HostedDatabasesByPage = ReadonlyMap<string, DatabaseSidebarRowEntry[]>;

const EMPTY_MAP: HostedDatabasesByPage = new Map();
const NO_ENTRIES: DatabaseSidebarRowEntry[] = [];

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
  const databaseBlocks = useDatabaseBlocksSnapshot();
  const databases = useLocalDatabasesSnapshot();

  const byPage = useMemo<HostedDatabasesByPage>(() => {
    if (!isClient) {
      return EMPTY_MAP;
    }

    const databasesById = new Map(
      databases.map((database) => [database.id, database])
    );
    const map = new Map<string, DatabaseSidebarRowEntry[]>();
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
export function useHostedDatabases(pageId: string): DatabaseSidebarRowEntry[] {
  return useContext(HostedDatabasesContext).get(pageId) ?? NO_ENTRIES;
}

/** All hosted-database rows for one host page, rendered after its child pages. */
export function PageListDatabaseRows({
  depth,
  hostPageId,
}: {
  depth: number;
  hostPageId: string;
}): ReactNode {
  const entries = useHostedDatabases(hostPageId);

  if (entries.length === 0) {
    return null;
  }

  return entries.map((database) => (
    <DatabaseSidebarRow database={database} depth={depth} key={database.id} />
  ));
}
