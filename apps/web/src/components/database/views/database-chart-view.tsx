import { type ReactNode, useMemo } from "react";

import { DatabaseCartesianChart } from "@/components/database/views/database-cartesian-chart.tsx";
import { CHART_PLOT_HEIGHT_PX } from "@/components/database/views/database-chart-parts.tsx";
import { DatabasePieChart } from "@/components/database/views/database-pie-chart.tsx";
import { DatabaseTimeSeriesChart } from "@/components/database/views/database-time-series-chart.tsx";
import {
  buildChartData,
  CHART_Y_AGGREGATE_LABELS,
  type DatabaseChartConfig,
  DEFAULT_CHART_MARK,
  DEFAULT_CHART_Y_AGGREGATE,
  resolveChartXField,
  resolveChartYField,
} from "@/lib/databases/chart-data.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * @fileoverview Chart saved view: picks the renderer `view.config.chart` asks
 * for and guards the states where no chart can be drawn.
 *
 * Three renderers sit behind this: the categorical Cartesian marks, the pie
 * mark, and the time-axis path (which loads captured field history
 * asynchronously and so cannot share the synchronous dataset). Configuration
 * lives in the database ⋯ settings menu's "Chart options" submenu
 * (`database-chart-config.tsx`); the chart surface itself carries no controls
 * in either mode, though tooltips stay interactive.
 */

/** Props contract for saved-view renderers mounted by `database-table-view.tsx`. */
export interface DatabaseChartViewProps {
  database: LocalDatabase;
  /** Full field schema (visibility is a per-view concern, applied here). */
  fields: DatabaseField[];
  mode: "view" | "edit";
  /** Filtered + sorted + formula-merged rows computed by the entry. */
  rows: LocalDatabaseRow[];
  /** The saved view being rendered (`view.type === "chart"`). */
  view: DatabaseView;
}

const EMPTY_CHART_CONFIG: DatabaseChartConfig = {};

/** Dashed guidance panel at plot height for unconfigured / empty states. */
function ChartEmptyState({
  hint,
  title,
}: {
  hint?: string;
  title: string;
}): ReactNode {
  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-border border-dashed px-4 text-center"
      style={{ height: CHART_PLOT_HEIGHT_PX }}
    >
      <span className="font-medium text-muted-foreground text-sm">{title}</span>
      {hint ? (
        <span className="text-muted-foreground/70 text-xs">{hint}</span>
      ) : null}
    </div>
  );
}

export function DatabaseChartView({
  database,
  fields,
  mode,
  rows,
  view,
}: DatabaseChartViewProps): ReactNode {
  const chart = view.config.chart ?? EMPTY_CHART_CONFIG;
  const mark = chart.mark ?? DEFAULT_CHART_MARK;
  const aggregate = chart.yAggregate ?? DEFAULT_CHART_Y_AGGREGATE;
  const xField = resolveChartXField(fields, chart);
  const yField = resolveChartYField(fields, chart);
  const data = useMemo(
    () => buildChartData(fields, rows, chart),
    [fields, rows, chart]
  );

  // Time-axis charts take a separate async-loaded path (history + backfill).
  if (chart.xMode === "time") {
    return (
      <DatabaseTimeSeriesChart
        chart={chart}
        database={database}
        fields={fields}
        mode={mode}
        rows={rows}
        view={view}
      />
    );
  }

  if (!xField) {
    return (
      <ChartEmptyState
        hint={
          mode === "edit"
            ? "Choose an X axis property in the chart settings."
            : "This chart has no X axis property yet."
        }
        title="Pick a field to chart"
      />
    );
  }
  if (aggregate !== "count" && !yField) {
    return (
      <ChartEmptyState
        hint="Pick a number property to aggregate in the chart settings, or switch the Y value to Count."
        title={`${CHART_Y_AGGREGATE_LABELS[aggregate]} needs a number property`}
      />
    );
  }
  if (data.categories.length === 0) {
    return (
      <ChartEmptyState
        hint="Rows matching this view will appear here."
        title="No data to chart"
      />
    );
  }
  if (mark === "pie") {
    return (
      <DatabasePieChart
        aggregate={aggregate}
        chart={chart}
        data={data}
        yField={yField}
      />
    );
  }
  return (
    <DatabaseCartesianChart
      aggregate={aggregate}
      chart={chart}
      data={data}
      mark={mark}
      yField={yField}
    />
  );
}
