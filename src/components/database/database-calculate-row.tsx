import { type ReactNode, useMemo } from "react";

import {
  aggregateFnLabel,
  type GridColumn,
  selectColumnPinnedClass,
} from "@/components/database/database-grid-helpers.ts";
import {
  computeAggregate,
  formatAggregateValue,
} from "@/lib/databases/row-aggregate.ts";
import type {
  DatabaseAggregateFn,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Footer Calculate row: per-column aggregates from
 * `view.config.calculations`, computed over the view's filtered row set.
 * Grouped views additionally render {@link DatabaseGroupAggregateCells} —
 * the SAME calculations computed over one group's rows — inside each group
 * header band, on the footer's column geometry and formatting.
 */

/** Date reducers read left-aligned; every numeric result right-aligns. */
function isNumericAggregate(fn: DatabaseAggregateFn): boolean {
  return fn !== "earliest" && fn !== "latest";
}

interface AggregateResult {
  alignEnd: boolean;
  label: string;
  value: string;
}

/**
 * One formatted aggregate per configured visible column, keyed by field id —
 * shared by the footer row and the per-group header overlay so both surfaces
 * format identically (`aggregateFnLabel` + `formatAggregateValue`).
 */
function useAggregateResults(
  calculations: Partial<Record<string, DatabaseAggregateFn>>,
  columns: readonly GridColumn[],
  rows: readonly LocalDatabaseRow[]
): ReadonlyMap<string, AggregateResult> {
  return useMemo(() => {
    const byFieldId = new Map<string, AggregateResult>();
    for (const column of columns) {
      const fn = calculations[column.field.id];
      if (!fn) {
        continue;
      }
      const value = formatAggregateValue(
        fn,
        column.field,
        computeAggregate(fn, column.field, rows)
      );
      byFieldId.set(column.field.id, {
        alignEnd: isNumericAggregate(fn),
        label: aggregateFnLabel(fn),
        value,
      });
    }
    return byFieldId;
  }, [calculations, columns, rows]);
}

/** The shared "Label value" cell content ("Sum 42"). */
function AggregateCellContent({
  result,
}: {
  result: AggregateResult;
}): ReactNode {
  return (
    <>
      <span className="truncate text-muted-foreground/70 text-xs">
        {result.label}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {result.value}
      </span>
    </>
  );
}

interface DatabaseGroupAggregateCellsProps {
  calculations: Partial<Record<string, DatabaseAggregateFn>>;
  columns: readonly GridColumn[];
  /** Leading select-lane width (always {@link SELECTION_COLUMN_WIDTH_PX}). */
  rowSelectLeadingWidth: number;
  /** ONE group's rows (`DatabaseRowGroup.rows`). */
  rows: readonly LocalDatabaseRow[];
}

/**
 * Per-group aggregates for a grouped table view: the footer's calculations
 * computed over one group's rows, laid out on the footer's column geometry
 * so each value reads under its column — Notion's grouped-table treatment.
 * Rendered as a non-interactive overlay inside the group header band
 * (`GridGroupHeaderRow`), so a COLLAPSED group keeps its aggregates visible
 * (the main value of the feature). Cells are statically positioned — no
 * pinned-column stickiness (the semi-transparent band has no opaque
 * background to mask scrolled-under text) — and the sticky group label
 * paints above (`z-10` vs. this layer's auto), so a long label wins any
 * overlap with a first-column aggregate.
 */
export function DatabaseGroupAggregateCells({
  calculations,
  columns,
  rowSelectLeadingWidth,
  rows,
}: DatabaseGroupAggregateCellsProps): ReactNode {
  const results = useAggregateResults(calculations, columns, rows);
  if (results.size === 0) {
    return null;
  }
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex"
      data-testid="group-aggregates"
    >
      {rowSelectLeadingWidth > 0 ? (
        <div className="shrink-0" style={{ width: rowSelectLeadingWidth }} />
      ) : null}
      {columns.map((column) => {
        const result = results.get(column.field.id);
        return (
          <div
            className={cn(
              "flex h-9 shrink-0 items-baseline gap-1.5 overflow-hidden px-2 py-2",
              result?.alignEnd && "justify-end"
            )}
            key={column.field.id}
            style={{ width: column.width }}
          >
            {result ? <AggregateCellContent result={result} /> : null}
          </div>
        );
      })}
    </div>
  );
}

interface DatabaseCalculateRowProps {
  calculations: Partial<Record<string, DatabaseAggregateFn>>;
  columns: readonly GridColumn[];
  /** Leading select-lane width (always {@link SELECTION_COLUMN_WIDTH_PX}). */
  rowSelectLeadingWidth: number;
  /** The view's filtered (pre-aggregate) row set. */
  rows: readonly LocalDatabaseRow[];
  /** Leading select column pinned when horizontal pinning is enabled. */
  selectColumnPinned: boolean;
  totalWidth: number;
}

/** Sticky footer row rendering one formatted aggregate per configured column. */
export function DatabaseCalculateRow({
  calculations,
  columns,
  rowSelectLeadingWidth,
  rows,
  selectColumnPinned,
  totalWidth,
}: DatabaseCalculateRowProps): ReactNode {
  const results = useAggregateResults(calculations, columns, rows);

  return (
    <div
      className="sticky bottom-0 z-20 flex bg-background"
      style={{ width: totalWidth, minWidth: "100%" }}
    >
      {rowSelectLeadingWidth > 0 ? (
        <div
          aria-hidden
          className={cn(
            "h-9 shrink-0",
            selectColumnPinnedClass(selectColumnPinned)
          )}
          style={{ width: rowSelectLeadingWidth }}
        />
      ) : null}
      {columns.map((column) => {
        const result = results.get(column.field.id);
        return (
          <div
            className={cn(
              "flex h-9 shrink-0 items-baseline gap-1.5 overflow-hidden border-border border-t px-2 py-2",
              column.showVerticalLine && "border-border/60 border-r",
              result?.alignEnd && "justify-end",
              column.pinned && "sticky z-10 bg-background",
              column.isLastPinned && "border-r border-r-border"
            )}
            key={column.field.id}
            style={{
              width: column.width,
              left: column.left ?? undefined,
            }}
          >
            {result ? <AggregateCellContent result={result} /> : null}
          </div>
        );
      })}
    </div>
  );
}
