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
 * Display only this milestone — the aggregate picker arrives in Wave 3.
 */

/** Date reducers read left-aligned; every numeric result right-aligns. */
function isNumericAggregate(fn: DatabaseAggregateFn): boolean {
  return fn !== "earliest" && fn !== "latest";
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
  const results = useMemo(() => {
    const byFieldId = new Map<string, { label: string; value: string }>();
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
      byFieldId.set(column.field.id, { label: aggregateFnLabel(fn), value });
    }
    return byFieldId;
  }, [calculations, columns, rows]);

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
        const fn = calculations[column.field.id];
        const alignEnd = fn ? isNumericAggregate(fn) : false;
        return (
          <div
            className={cn(
              "flex h-9 shrink-0 items-baseline gap-1.5 overflow-hidden border-border border-t px-2 py-2",
              column.showVerticalLine && "border-border/60 border-r",
              alignEnd && "justify-end",
              column.pinned && "sticky z-10 bg-background",
              column.isLastPinned && "border-r border-r-border"
            )}
            key={column.field.id}
            style={{
              width: column.width,
              left: column.left ?? undefined,
            }}
          >
            {result ? (
              <>
                <span className="truncate text-muted-foreground/70 text-xs">
                  {result.label}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {result.value}
                </span>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
