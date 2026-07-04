import { type ReactNode, useMemo } from "react";

import { DatabaseFilterBar } from "@/components/database/database-filter-bar.tsx";
import { DatabaseMobileToolbar } from "@/components/database/database-mobile-toolbar.tsx";
import { DatabaseTableGrid } from "@/components/database/database-table-grid.tsx";
import { DatabaseTitle } from "@/components/database/database-title.tsx";
import { useDatabase, useDatabaseRows } from "@/db/queries/use-database.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { applyFilter } from "@/lib/databases/row-filter.ts";
import {
  type DatabaseRowGroup,
  groupRowsForView,
  resolveGroupByField,
} from "@/lib/databases/row-group.ts";
import { sortRowsForView } from "@/lib/databases/row-sort.ts";
import {
  resolveColumnOrder,
  resolvePinnedFields,
} from "@/lib/databases/view-config.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

/** Props contract for the database grid rendered by `database` blocks. */
export interface DatabaseTableViewProps {
  databaseId: string;
  /**
   * Block-level "hide title" flag. Edit mode keeps the toolbar row (settings
   * ⋯ and mobile filter/sort buttons) without the name; view mode drops the
   * whole row.
   */
  hideTitle?: boolean;
  mode: "view" | "edit";
  /** Persists the settings menu's "Hide title" toggle onto the block. */
  onHideTitleChange?: (hideTitle: boolean) => void;
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
  hideTitle = false,
  mode,
  onHideTitleChange,
}: DatabaseTableViewProps): ReactNode {
  const database = useDatabase(databaseId);
  const allRows = useDatabaseRows(databaseId);
  const isNarrowViewport = useIsNarrowViewport();
  const view = database?.views[0];

  const rows = useMemo<LocalDatabaseRow[]>(() => {
    if (!(database && view)) {
      return [];
    }
    const filtered = applyFilter(allRows, database.fields, view.filter);
    return sortRowsForView(filtered, database.fields, view);
  }, [allRows, database, view]);

  // Row buckets for grouped views, built AFTER filter + sort so buckets
  // preserve the view's row order; `null` keeps the grid ungrouped (also the
  // fallback for stale/formula group-by fields).
  const groups = useMemo<DatabaseRowGroup[] | null>(() => {
    if (!(database && view && resolveGroupByField(database.fields, view))) {
      return null;
    }
    return groupRowsForView(rows, database.fields, view);
  }, [database, rows, view]);

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

  // View mode with a hidden title has no controls left, so the whole row
  // disappears; edit mode keeps the collapsed row as the toolbar's home.
  const showTitleRow = mode === "edit" || !hideTitle;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {showTitleRow ? (
        <DatabaseTitle
          controls={
            mode === "edit" && isNarrowViewport ? (
              <DatabaseMobileToolbar
                databaseId={databaseId}
                fields={database.fields}
                view={view}
              />
            ) : null
          }
          database={database}
          hideTitle={hideTitle}
          mode={mode}
          onHideTitleChange={onHideTitleChange}
          rowCount={rows.length}
          totalRowCount={allRows.length}
        />
      ) : null}
      {mode === "edit" && !isNarrowViewport ? (
        <DatabaseFilterBar
          databaseId={databaseId}
          fields={database.fields}
          view={view}
        />
      ) : null}
      <DatabaseTableGrid
        columns={columns}
        databaseId={databaseId}
        groups={groups}
        isSyncedDatabase={database.source?.kind === "connector"}
        mode={mode}
        pinnedFields={pinnedFields}
        primaryFieldId={database.primaryFieldId}
        rows={rows}
        view={view}
      />
    </div>
  );
}
