import { type ReactNode, useMemo } from "react";

import { DatabaseFilterBar } from "@/components/database/database-filter-bar.tsx";
import { DatabaseTableGrid } from "@/components/database/database-table-grid.tsx";
import { DatabaseTitle } from "@/components/database/database-title.tsx";
import { useDatabase, useDatabaseRows } from "@/db/queries/use-database.ts";
import { applyFilter } from "@/lib/databases/row-filter.ts";
import { sortRowsForView } from "@/lib/databases/row-sort.ts";
import {
  resolveColumnOrder,
  resolvePinnedFields,
} from "@/lib/databases/view-config.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

/** Props contract for the database grid rendered by `database` blocks. */
export interface DatabaseTableViewProps {
  databaseId: string;
  mode: "view" | "edit";
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
      {message}
    </div>
  );
}

/**
 * Table view for one workspace database: resolves the definition and rows via
 * live queries, applies the first view's filter/sorts, and renders the
 * virtualized grid with its title, Calculate row, and add-row strip.
 * View-id threading (which saved view a block shows) arrives later.
 */
export function DatabaseTableView({
  databaseId,
  mode,
}: DatabaseTableViewProps): ReactNode {
  const database = useDatabase(databaseId);
  const allRows = useDatabaseRows(databaseId);
  const view = database?.views[0];

  const rows = useMemo<LocalDatabaseRow[]>(() => {
    if (!(database && view)) {
      return [];
    }
    const filtered = applyFilter(allRows, database.fields, view.filter);
    return sortRowsForView(filtered, database.fields, view);
  }, [allRows, database, view]);

  const columns = useMemo(
    () => (database && view ? resolveColumnOrder(database.fields, view) : []),
    [database, view]
  );

  const pinnedFields = useMemo(
    () => (database && view ? resolvePinnedFields(database.fields, view) : []),
    [database, view]
  );

  if (!database) {
    return <EmptyState message="Database not found" />;
  }
  if (!view) {
    return <EmptyState message="No views" />;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <DatabaseTitle
        databaseId={databaseId}
        mode={mode}
        name={database.name}
        rowCount={rows.length}
      />
      {mode === "edit" ? (
        <DatabaseFilterBar
          databaseId={databaseId}
          fields={database.fields}
          view={view}
        />
      ) : null}
      <DatabaseTableGrid
        columns={columns}
        databaseId={databaseId}
        mode={mode}
        pinnedFields={pinnedFields}
        primaryFieldId={database.primaryFieldId}
        rows={rows}
        view={view}
      />
    </div>
  );
}
