"use client";

import { localBlocksCollection } from "@/db/collections/local-collections.ts";
import { useDatabase } from "@/db/queries/use-database.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  databaseHubNavTarget,
  databaseRowNavTarget,
  databaseTemplateNavTarget,
} from "@/lib/databases/database-page-paths.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

/** Resolves canonical slug-based navigation targets for a local database. */
export function useDatabasePathTargets(
  databaseId: string,
  row?: LocalDatabaseRow
) {
  const database = useDatabase(databaseId);
  const { pages } = useMergedPageListItems();
  const blocks = localBlocksCollection.toArray;

  return {
    hub: database ? databaseHubNavTarget(database, pages, blocks) : null,
    row:
      database && row
        ? databaseRowNavTarget(database, row, pages, blocks)
        : null,
    template: database
      ? databaseTemplateNavTarget(database, pages, blocks)
      : null,
  };
}
