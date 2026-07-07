import { IconTrash } from "@tabler/icons-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { DatabaseFilterBar } from "@/components/database/database-filter-bar.tsx";
import { filterHasRelativeOperator } from "@/components/database/database-filter-helpers.ts";
import { DatabaseMobileToolbar } from "@/components/database/database-mobile-toolbar.tsx";
import { DatabaseTableGrid } from "@/components/database/database-table-grid.tsx";
import { DatabaseTitle } from "@/components/database/database-title.tsx";
import { DatabaseViewSwitcher } from "@/components/database/database-view-switcher.tsx";
import { DatabaseBoardView } from "@/components/database/views/database-board-view.tsx";
import { DatabaseChartView } from "@/components/database/views/database-chart-view.tsx";
import { DatabaseListView } from "@/components/database/views/database-list-view.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useDatabase, useDatabaseRows } from "@/db/queries/use-database.ts";
import { watchDatabaseSync } from "@/db/sync/database-sync-engine.ts";
import { buildChartData } from "@/lib/databases/chart-data.ts";
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
  DatabaseFilterGroup,
  DatabaseView,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/** Props contract for the database surface rendered by `database` blocks. */
export interface DatabaseTableViewProps {
  databaseId: string;
  /**
   * Block-level "hide title" flag. Edit mode keeps the toolbar row (settings
   * ⋯ and mobile filter/sort buttons) without the name; view mode drops the
   * whole row.
   */
  hideTitle?: boolean;
  mode: "view" | "edit";
  /**
   * Invoked by the settings menu AFTER deleting the database, so the hosting
   * block can remove itself (the block is only a reference — a deleted
   * database has nothing to render). Absent outside a block (row page).
   */
  onDeleteDatabase?: () => void;
  /** Persists the settings menu's "Hide title" toggle onto the block. */
  onHideTitleChange?: (hideTitle: boolean) => void;
  /**
   * Removes the hosting block when its database can no longer be resolved
   * (deleted from another block / tab). Powers the "Remove" action in the
   * dangling-reference state. Absent outside a block (row page).
   */
  onRemoveBlock?: () => void;
  /**
   * Persists a view switch onto the hosting block (`props.viewId`) — the
   * active view is per BLOCK, like Notion linked views. Absent in view mode
   * (published pages can't write block props): switching falls back to
   * ephemeral local state.
   */
  onViewIdChange?: (viewId: string) => void;
  /** Block-level saved-view pick; unset or stale ids fall back to the first view. */
  viewId?: string;
}

function EmptyState({
  action,
  message,
}: {
  action?: ReactNode;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
      <span>{message}</span>
      {action}
    </div>
  );
}

/**
 * Refresh cadence for clock-dependent display: volatile (`now()`/`today()`)
 * formulas and `relative`-format date columns.
 */
const DISPLAY_CLOCK_REFRESH_MS = 60_000;

const NO_FIELDS: DatabaseField[] = [];

/** Whether any of the given (visible) date fields displays relatively. */
function hasRelativeDateField(fields: readonly DatabaseField[]): boolean {
  return fields.some(
    (field) => field.type === "date" && field.format === "relative"
  );
}

/**
 * The single visible clock behind time-dependent display AND filtering:
 * ticks every minute while any formula uses `now()`/`today()`, any visible
 * date column uses the `relative` format ("3 days ago" must not go stale on
 * screen), OR the active view's filter contains a relative date operator
 * (`pastDay`…`nextMonth` windows shift as time passes — `applyFilter` re-runs
 * on the tick). Pauses entirely while the tab is hidden (refreshing
 * immediately when it becomes visible again). Non-clock-dependent schemas
 * keep the mount-time instant — their renders never read the clock.
 */
function useDisplayClock(
  fields: readonly DatabaseField[],
  visibleFields: readonly DatabaseField[],
  filter: DatabaseFilterGroup | undefined
): Date {
  const ticking = useMemo(
    () =>
      hasVolatileFormula(fields) ||
      hasRelativeDateField(visibleFields) ||
      filterHasRelativeOperator(filter),
    [fields, visibleFields, filter]
  );
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!ticking) {
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
        }, DISPLAY_CLOCK_REFRESH_MS);
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
  }, [ticking]);

  return now;
}

/** Inline filter/sort chip bar visibility (title icons toggle the whole bar). */
function resolveInlineFilterBarState(
  view: DatabaseView,
  mode: "view" | "edit",
  filterBarVisible: boolean
): {
  hasFilters: boolean;
  hasSortsOrGrouping: boolean;
  showInlineFilterBar: boolean;
} {
  const hasFilters = (view.filter?.conditions.length ?? 0) > 0;
  const hasSorts = (view.sorts?.length ?? 0) > 0;
  const hasGrouping = view.groupBy !== undefined;
  const hasSortsOrGrouping = hasSorts || hasGrouping;
  const hasBarContent = hasFilters || hasSortsOrGrouping;
  return {
    hasFilters,
    hasSortsOrGrouping,
    showInlineFilterBar: mode === "edit" && filterBarVisible && hasBarContent,
  };
}

interface DatabaseViewBodyProps {
  clockNow: Date;
  columns: DatabaseField[];
  database: NonNullable<ReturnType<typeof useDatabase>>;
  databaseId: string;
  groups: DatabaseRowGroup[] | null;
  isSyncedDatabase: boolean;
  mode: "view" | "edit";
  pinnedFields: DatabaseField[];
  rows: LocalDatabaseRow[];
  view: DatabaseView;
}

/** Per-type view body below the title row and optional filter chip bar. */
function DatabaseViewBody({
  clockNow,
  columns,
  database,
  databaseId,
  groups,
  isSyncedDatabase,
  mode,
  pinnedFields,
  rows,
  view,
}: DatabaseViewBodyProps): ReactNode {
  if (view.type === "list") {
    return (
      <DatabaseListView
        database={database}
        fields={database.fields}
        mode={mode}
        rows={rows}
        view={view}
      />
    );
  }
  if (view.type === "board") {
    return (
      <DatabaseBoardView
        database={database}
        fields={database.fields}
        mode={mode}
        rows={rows}
        view={view}
      />
    );
  }
  if (view.type === "chart") {
    return (
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode={mode}
        rows={rows}
        view={view}
      />
    );
  }
  return (
    <DatabaseTableGrid
      columns={columns}
      databaseId={databaseId}
      groups={groups}
      isSyncedDatabase={isSyncedDatabase}
      mode={mode}
      now={clockNow}
      pinnedFields={pinnedFields}
      primaryFieldId={database.primaryFieldId}
      rows={rows}
      view={view}
    />
  );
}

/**
 * Entry for one workspace database surface: resolves the definition and rows
 * via live queries, resolves the ACTIVE view (`block.viewId`, falling back to
 * the first view for unset/stale ids), applies that view's filter/sorts, and
 * renders the per-type view body — the virtualized table grid, or the
 * list/board/chart renderers — under the shared title row + view switcher.
 */
export function DatabaseTableView({
  databaseId,
  hideTitle = false,
  mode,
  onDeleteDatabase,
  onHideTitleChange,
  onRemoveBlock,
  onViewIdChange,
  viewId,
}: DatabaseTableViewProps): ReactNode {
  const database = useDatabase(databaseId);
  const allRows = useDatabaseRows(databaseId);
  // Ephemeral fallback for surfaces that can't persist the pick (view mode
  // has no block-prop write path); when `onViewIdChange` exists the block
  // prop is the single source of truth and local state stays unused.
  const [ephemeralViewId, setEphemeralViewId] = useState<string | undefined>();
  const [filterBarVisible, setFilterBarVisible] = useState(true);
  const requestedViewId = onViewIdChange ? viewId : (ephemeralViewId ?? viewId);
  const view =
    database?.views.find((candidate) => candidate.id === requestedViewId) ??
    database?.views[0];

  const handleViewIdChange = useCallback(
    (nextViewId: string) => {
      setFilterBarVisible(true);
      if (onViewIdChange) {
        onViewIdChange(nextViewId);
      } else {
        setEphemeralViewId(nextViewId);
      }
    },
    [onViewIdChange]
  );

  const fields = database?.fields ?? NO_FIELDS;

  const columns = useMemo(
    () => (database && view ? resolveColumnOrder(database.fields, view) : []),
    [database, view]
  );

  const clockNow = useDisplayClock(fields, columns, view?.filter);

  // Watch mode: while ANY view of a synced database is mounted (edit mode
  // and published view mode alike), the sync engine polls at the connector's
  // floor so the table changes in near-real-time on screen. Ref-counted with
  // cleanup on unmount; a no-op for local databases.
  const isSyncedDatabase = database?.source?.kind === "connector";
  useEffect(() => {
    if (!isSyncedDatabase) {
      return;
    }
    return watchDatabaseSync(databaseId);
  }, [databaseId, isSyncedDatabase]);

  // Formula overlay: computed values merged into row COPIES so formulas ride
  // the whole existing pipeline — filter, sort, group, Calculate row, and the
  // grid's cells all read merged values. No formula fields → rows pass
  // through untouched.
  const mergedRows = useMemo<LocalDatabaseRow[]>(() => {
    const overlay = computeFormulaOverlay(fields, allRows, {
      now: () => clockNow,
    });
    return withFormulaValues(allRows, overlay);
  }, [allRows, fields, clockNow]);

  const rows = useMemo<LocalDatabaseRow[]>(() => {
    if (!(database && view)) {
      return [];
    }
    // `clockNow` in the deps keeps relative-window filters live: each display
    // clock tick recomputes the filter against the fresh instant.
    const filtered = applyFilter(mergedRows, database.fields, view.filter, {
      now: () => clockNow,
    });
    return sortRowsForView(filtered, database.fields, view);
  }, [mergedRows, database, view, clockNow]);

  // Row buckets for grouped views, built AFTER filter + sort so buckets
  // preserve the view's row order; `null` keeps the grid ungrouped (also the
  // fallback for stale/formula group-by fields).
  const groups = useMemo<DatabaseRowGroup[] | null>(() => {
    if (!(database && view && resolveGroupByField(database.fields, view))) {
      return null;
    }
    return groupRowsForView(rows, database.fields, view);
  }, [database, rows, view]);

  const pinnedFields = useMemo(
    () => (database && view ? resolvePinnedFields(database.fields, view) : []),
    [database, view]
  );

  // Chart dataset, computed once for chart views and threaded to the settings
  // menu's "Chart" submenu (its per-series/slice color rows need the resolved
  // series/category keys) so the config matches what the chart renders.
  const chartData = useMemo(
    () =>
      database && view?.type === "chart"
        ? buildChartData(database.fields, rows, view.config.chart ?? {})
        : undefined,
    [database, view, rows]
  );

  if (!database) {
    // A block whose database was deleted (here or in another tab) has nothing
    // to render — offer to remove the now-empty reference instead of leaving a
    // permanent "not found" shell. Read-only/row-page contexts (no
    // `onRemoveBlock`) keep the neutral message.
    return (
      <EmptyState
        action={
          onRemoveBlock ? (
            <Button onClick={onRemoveBlock} size="sm" variant="outline">
              <IconTrash />
              Remove
            </Button>
          ) : undefined
        }
        message="This database was deleted."
      />
    );
  }
  if (!view) {
    return <EmptyState message="No views" />;
  }

  // View mode with a hidden title has no controls left, so the whole row
  // disappears; edit mode keeps the collapsed row as the toolbar's home.
  const showTitleRow = mode === "edit" || !hideTitle;

  const { hasFilters, hasSortsOrGrouping, showInlineFilterBar } =
    resolveInlineFilterBarState(view, mode, filterBarVisible);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {showTitleRow ? (
        <DatabaseTitle
          activeView={view}
          chartData={chartData}
          controls={
            mode === "edit" ? (
              <DatabaseMobileToolbar
                databaseId={databaseId}
                fields={database.fields}
                filterBarVisible={filterBarVisible}
                onFilterBarVisibleChange={setFilterBarVisible}
                view={view}
              />
            ) : null
          }
          database={database}
          hideTitle={hideTitle}
          mode={mode}
          onDeleteDatabase={onDeleteDatabase}
          onHideTitleChange={onHideTitleChange}
          onViewIdChange={handleViewIdChange}
          totalRowCount={allRows.length}
          viewSwitcher={
            <DatabaseViewSwitcher
              activeViewId={view.id}
              databaseId={databaseId}
              mode={mode}
              onViewIdChange={handleViewIdChange}
              views={database.views}
            />
          }
        />
      ) : null}
      {showInlineFilterBar ? (
        <DatabaseFilterBar
          databaseId={databaseId}
          fields={database.fields}
          showFilterAddTrigger={hasFilters}
          showFilterChips={hasFilters}
          showSortAddTrigger={hasSortsOrGrouping}
          view={view}
        />
      ) : null}
      <DatabaseViewBody
        clockNow={clockNow}
        columns={columns}
        database={database}
        databaseId={databaseId}
        groups={groups}
        isSyncedDatabase={isSyncedDatabase}
        mode={mode}
        pinnedFields={pinnedFields}
        rows={rows}
        view={view}
      />
    </div>
  );
}
