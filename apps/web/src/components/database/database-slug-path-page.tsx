import { useLiveQuery } from "@tanstack/react-db";
import { type ReactNode, useMemo } from "react";
import { DatabaseHubPage } from "@/components/database/database-hub-page.tsx";
import { DatabaseRowPage } from "@/components/database/row-page/database-row-page.tsx";
import { DatabaseTemplateEditorClient } from "@/components/database/row-page/database-template-editor.tsx";
import {
  localBlocksCollection,
  localDatabaseRowsCollection,
} from "@/db/collections/local-collections.ts";
import { useLocalDatabasesSnapshot } from "@/hooks/use-local-databases.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  type ResolvedDatabasePath,
  resolveDatabasePathFromSplat,
} from "@/lib/databases/database-page-paths.ts";

/**
 * Client-side renderer for a database path after normal page-slug resolution
 * has failed. Database data is local-first, so these paths intentionally have
 * no server content loader.
 */
export function useDatabaseSlugPath(splat: string) {
  const databases = useLocalDatabasesSnapshot();
  const { pages } = useMergedPageListItems();
  const { data: rows = [] } = useLiveQuery(
    (query) => query.from({ row: localDatabaseRowsCollection }),
    []
  );
  const { data: blocks = [] } = useLiveQuery(
    (query) => query.from({ block: localBlocksCollection }),
    []
  );
  const resolved = useMemo(
    () =>
      resolveDatabasePathFromSplat(splat, {
        blocks,
        databases,
        pages,
        rows,
      }),
    [blocks, databases, pages, rows, splat]
  );

  return resolved;
}

/** Single kind→component matrix for hub / row / template slug paths. */
export function renderResolvedDatabasePath(
  resolved: ResolvedDatabasePath
): ReactNode {
  if (resolved.kind === "hub") {
    return <DatabaseHubPage databaseId={resolved.database.id} />;
  }
  if (resolved.kind === "row") {
    return resolved.row ? (
      <DatabaseRowPage
        databaseId={resolved.database.id}
        rowId={resolved.row.id}
      />
    ) : null;
  }
  if (resolved.kind === "template") {
    return <DatabaseTemplateEditorClient databaseId={resolved.database.id} />;
  }
  return null;
}

export function DatabaseSlugPathPage({ splat }: { splat: string }): ReactNode {
  const resolved = useDatabaseSlugPath(splat);
  return resolved ? renderResolvedDatabasePath(resolved) : null;
}
