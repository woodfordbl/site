import { eq, useLiveQuery } from "@tanstack/react-db";

import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/** Live database definition (fields + views) for one database id. */
export function useDatabase(databaseId: string): LocalDatabase | undefined {
  const { data: databases = [] } = useLiveQuery(
    (query) =>
      query
        .from({ database: localDatabasesCollection })
        .where(({ database }) => eq(database.id, databaseId)),
    [databaseId]
  );

  return databases[0];
}

/**
 * Live list of every database definition — the relation target pickers
 * (Change type, Edit property) enumerate all databases from it.
 */
export function useAllDatabases(): LocalDatabase[] {
  const { data: databases = [] } = useLiveQuery((query) =>
    query.from({ database: localDatabasesCollection })
  );

  return databases;
}

/**
 * Live rows for one database. Unordered and unfiltered by view — view-level
 * filter/sort/order application happens in the view layer. The declarative
 * `eq` predicate lets the collection's `databaseId` index serve the query.
 */
export function useDatabaseRows(databaseId: string): LocalDatabaseRow[] {
  const { data: rows = [] } = useLiveQuery(
    (query) =>
      query
        .from({ row: localDatabaseRowsCollection })
        .where(({ row }) => eq(row.databaseId, databaseId)),
    [databaseId]
  );

  return rows;
}
