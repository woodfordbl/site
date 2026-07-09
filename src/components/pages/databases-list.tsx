import { IconDatabase } from "@tabler/icons-react";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";

import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";

/**
 * Workspace-wide index of databases in the sidebar. Unlike the per-page
 * hosted-database child rows (which navigate to the host page), each row here
 * opens the database's own standalone page (`/db/$databaseId`). Client-only
 * data — the local databases collection paints nothing during SSR, so
 * {@link useIsClient} keeps the hydration render identical to SSR.
 */

interface DatabaseListEntry {
  icon?: string;
  id: string;
  name: string;
}

function useWorkspaceDatabases(): DatabaseListEntry[] {
  const isClient = useIsClient();
  const { data: databases = [] } = useLiveQuery((query) =>
    query.from({ database: localDatabasesCollection })
  );

  return useMemo<DatabaseListEntry[]>(() => {
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

function DatabaseListRow({
  database,
}: {
  database: DatabaseListEntry;
}): ReactNode {
  const navigate = useNavigate();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => {
          navigate({
            params: { databaseId: database.id },
            to: "/db/$databaseId",
          });
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

/** Rows for the sidebar "Databases" section — every workspace database. */
export function DatabasesList(): ReactNode {
  const databases = useWorkspaceDatabases();

  if (databases.length === 0) {
    return null;
  }

  return (
    <SidebarMenu className="gap-y-px">
      {databases.map((database) => (
        <DatabaseListRow database={database} key={database.id} />
      ))}
    </SidebarMenu>
  );
}
