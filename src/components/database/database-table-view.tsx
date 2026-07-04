import { type ReactNode, useEffect, useMemo, useState } from "react";

import { DatabaseFilterBar } from "@/components/database/database-filter-bar.tsx";
import { DatabaseMobileToolbar } from "@/components/database/database-mobile-toolbar.tsx";
import { DatabaseTableGrid } from "@/components/database/database-table-grid.tsx";
import { DatabaseTitle } from "@/components/database/database-title.tsx";
import { useDatabase, useDatabaseRows } from "@/db/queries/use-database.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import {
  computeFormulaOverlay,
  hasVolatileFormula,
  withFormulaValues,
} from "@/lib/databases/formula-values.ts";
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
import type {
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

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

/** Re-evaluation cadence for clock-dependent (`now()`/`today()`) formulas. */
const VOLATILE_FORMULA_REFRESH_MS = 60_000;

const NO_FIELDS: DatabaseField[] = [];

/**
 * Clock driving volatile formula re-evaluation: ticks every minute while any
 * formula uses `now()`/`today()`, pausing entirely while the tab is hidden
 * (and refreshing immediately when it becomes visible again). Non-volatile
 * schemas keep the mount-time instant — their results never read the clock.
 */
function useFormulaClock(fields: readonly DatabaseField[]): Date {
  const volatile = useMemo(() => hasVolatileFormula(fields), [fields]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!volatile) {
      return;
    }
    let intervalId: number | undefined;
    const stop = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };
    const start = () => {
      if (intervalId === undefined) {
        intervalId = window.setInterval(() => {
          setNow(new Date());
        }, VOLATILE_FORMULA_REFRESH_MS);
      }
    };
    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        setNow(new Date());
        start();
      }
    };
    if (!document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [volatile]);

  return now;
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

  const fields = database?.fields ?? NO_FIELDS;
  const formulaNow = useFormulaClock(fields);

  // Formula overlay: computed values merged into row COPIES so formulas ride
  // the whole existing pipeline — filter, sort, group, Calculate row, and the
  // grid's cells all read merged values. No formula fields → rows pass
  // through untouched.
  const mergedRows = useMemo<LocalDatabaseRow[]>(() => {
    const overlay = computeFormulaOverlay(fields, allRows, {
      now: () => formulaNow,
    });
    return withFormulaValues(allRows, overlay);
  }, [allRows, fields, formulaNow]);

  const rows = useMemo<LocalDatabaseRow[]>(() => {
    if (!(database && view)) {
      return [];
    }
    const filtered = applyFilter(mergedRows, database.fields, view.filter);
    return sortRowsForView(filtered, database.fields, view);
  }, [mergedRows, database, view]);

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
