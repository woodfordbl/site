import { useLiveQuery } from "@tanstack/react-db";
import { type ReactNode, useMemo } from "react";

import {
  DatabaseSidebarRow,
  type DatabaseSidebarRowEntry,
} from "@/components/pages/database-sidebar-row.tsx";
import { SidebarMenu } from "@/components/ui/sidebar.tsx";
import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";

/**
 * Workspace-wide index of databases in the sidebar. Unlike the per-page
 * hosted-database child rows (which navigate to the host page), each row here
 * opens the database's own standalone page (`/db/$databaseId`). Client-only
 * data — the local databases collection paints nothing during SSR, so
 * {@link useIsClient} keeps the hydration render identical to SSR.
 */

function useWorkspaceDatabases(): DatabaseSidebarRowEntry[] {
  const isClient = useIsClient();
  const { data: databases = [] } = useLiveQuery((query) =>
    query.from({ database: localDatabasesCollection })
  );

  return useMemo<DatabaseSidebarRowEntry[]>(() => {
    if (!isClient) {
      return [];
    }
    return databases
      .map((database) => ({
        icon: database.icon,
        id: database.id,
        name: database.name,
      }))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name, undefined, {
            sensitivity: "base",
          }) || left.id.localeCompare(right.id)
      );
  }, [databases, isClient]);
}

/** True when at least one database exists (gates the sidebar section). */
export function useHasDatabases(): boolean {
  return useWorkspaceDatabases().length > 0;
}

/** Rows for the sidebar "Databases" section — every workspace database. */
export function DatabasesList(): ReactNode {
  const databases = useWorkspaceDatabases();

  if (databases.length === 0) {
    return null;
  }

  return (
    <SidebarMenu className="gap-y-px">
      {databases.map((database) => (
        <DatabaseSidebarRow database={database} key={database.id} />
      ))}
    </SidebarMenu>
  );
}
