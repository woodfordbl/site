/**
 * @fileoverview Per-type saved-view body dispatch, below the shared title row
 * and filter bar.
 *
 * Every non-table renderer receives the same
 * `{ database, fields, mode, rows, view }` contract with rows already
 * filtered, sorted and formula-merged by the entry, which is why filters and
 * sorts work identically on a list, board, chart or map without per-type code.
 */
import type { ReactNode } from "react";

import { DatabaseTableGrid } from "@/components/database/database-table-grid.tsx";
import { DatabaseBoardView } from "@/components/database/views/database-board-view.tsx";
import { DatabaseChartView } from "@/components/database/views/database-chart-view.tsx";
import { DatabaseListView } from "@/components/database/views/database-list-view.tsx";
import { DatabaseMapView } from "@/components/database/views/database-map-view.tsx";
import type { useDatabase } from "@/db/queries/use-database.ts";
import type { DatabaseRowGroup } from "@/lib/databases/row-group.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

interface DatabaseViewBodyProps {
  canvasRowId?: string;
  clockNow: Date;
  columns: DatabaseField[];
  database: NonNullable<ReturnType<typeof useDatabase>>;
  databaseId: string;
  fillHeight: boolean;
  groups: DatabaseRowGroup[] | null;
  isLiveMarkets: boolean;
  isSyncedDatabase: boolean;
  mode: "view" | "edit";
  pinnedFields: DatabaseField[];
  rows: LocalDatabaseRow[];
  view: DatabaseView;
}

/** Per-type view body below the title row and optional filter chip bar. */
export function DatabaseViewBody({
  canvasRowId,
  clockNow,
  columns,
  database,
  databaseId,
  fillHeight,
  groups,
  isLiveMarkets,
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
  if (view.type === "map") {
    return (
      <DatabaseMapView
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
      canvasRowId={canvasRowId}
      columns={columns}
      databaseId={databaseId}
      fillHeight={fillHeight}
      groups={groups}
      isLiveMarkets={isLiveMarkets}
      isSyncedDatabase={isSyncedDatabase}
      // Remount clears session row-selection when the database or active
      // view changes (selection is intentionally not persisted).
      key={`${databaseId}:${view.id}`}
      mode={mode}
      now={clockNow}
      pinnedFields={pinnedFields}
      primaryFieldId={database.primaryFieldId}
      rows={rows}
      view={view}
    />
  );
}
