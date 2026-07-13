import { type ReactNode, useMemo } from "react";

import {
  aggregateFnLabel,
  type GridColumn,
  GUTTER_LANE_SCROLL_CLASS,
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
  /** Skip the top rule under the select lane in gutter modes. */
  rowSelectGutter: boolean;
  /** Leading select-lane width (always {@link SELECTION_COLUMN_WIDTH_PX}). */
  rowSelectLeadingWidth: number;
  /** The view's filtered (pre-aggregate) row set. */
  rows: readonly LocalDatabaseRow[];
  totalWidth: number;
}

/** Sticky footer row rendering one formatted aggregate per configured column. */
export function DatabaseCalculateRow({
  calculations,
  columns,
  rowSelectGutter,
  rowSelectLeadingWidth,
  rows,
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
      className={cn(
        "sticky bottom-0 z-20 flex bg-background",
        !rowSelectGutter && "border-border border-t"
      )}
      style={{ width: totalWidth, minWidth: "100%" }}
    >
      {/* Leading selection-lane spacer — sticky at the lane's viewport
          offset (`--grid-bleed`, set on the grid root) so it stays under
          the select header while horizontally scrolling. Gutter modes ride
          the shared lane scroll behavior (pushed off / peek slide-in). */}
      {rowSelectLeadingWidth > 0 ? (
        <div
          aria-hidden
          className={cn(
            "sticky left-(--grid-bleed) z-10 h-9 shrink-0",
            rowSelectGutter ? GUTTER_LANE_SCROLL_CLASS : "bg-background"
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
              "flex h-9 shrink-0 items-baseline gap-1.5 overflow-hidden px-2 py-2",
              rowSelectGutter && "border-border border-t",
              column.showVerticalLine && "border-border/60 border-r",
              alignEnd && "justify-end",
              column.pinned && "sticky z-10 bg-background",
              column.isLastPinned && "border-r border-r-border"
            )}
            key={column.field.id}
            style={{
              width: column.width,
              // Pinned offsets already include the gutter bleed and the
              // selection column width (see the grid's `gridColumns` memo).
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
