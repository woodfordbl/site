import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useMemo, useRef } from "react";

import { DatabaseAddRow } from "@/components/database/database-add-row.tsx";
import { DatabaseCellValueView } from "@/components/database/database-cell.tsx";
import { useDatabasePathTargets } from "@/components/database/use-database-path-target.ts";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  coerceCellValue,
  formatCellValue,
  isCellEmpty,
} from "@/lib/databases/cell-values.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Compact list view (Linear-style): one 40px row per database row — the
 * primary field value leads, the view's other visible fields trail
 * right-aligned as muted pills/text via the shared cell renderers, and the
 * WHOLE row is the open affordance (a `Link` to the row page at
 * `/db/{databaseId}/{rowId}`, the same target as the grid's "Open" pill).
 *
 * The list has NO inline editors in v1 — edit mode only adds the trailing
 * "New row" ghost row (`insertDatabaseRow` via the shared strip; nothing is
 * focused afterwards, since there is nothing to focus). Cell values render
 * with the shared `DatabaseCellValueView` in `mode="edit"` regardless of the
 * view's mode so URL cells stay plain styled text — a nested `<a>` inside
 * the row link would be invalid HTML and double-navigate.
 *
 * Rows above {@link LIST_VIRTUALIZE_THRESHOLD} render through TanStack
 * Virtual inside a capped scrollport; smaller lists render a plain map with
 * no internal scroll container.
 */
export interface DatabaseListViewProps {
  database: LocalDatabase;
  /** Full field schema (visibility is a per-view concern, applied here). */
  fields: DatabaseField[];
  mode: "view" | "edit";
  /** Filtered + sorted + formula-merged rows computed by the entry. */
  rows: LocalDatabaseRow[];
  /** The saved view being rendered (`view.type === "list"`). */
  view: DatabaseView;
}

/** Above this row count the list virtualizes; below it renders a plain map. */
const LIST_VIRTUALIZE_THRESHOLD = 100;

/** Fixed list row height. */
const LIST_ROW_HEIGHT_PX = 40;

/** Extra virtual rows above/below the viewport. */
const LIST_OVERSCAN = 12;

/** Vertical cap so list virtualization has a bounded scrollport. */
const LIST_MAX_HEIGHT_CLASS = "max-h-[600px]";

/**
 * Trailing (secondary) fields for a list row: the view's `visibleFieldIds`
 * resolved against the schema (primary excluded — it always leads), or the
 * first three non-primary fields when the view has no materialized list.
 */
export function resolveListSecondaryFields(
  fields: readonly DatabaseField[],
  view: DatabaseView,
  primaryFieldId: string
): DatabaseField[] {
  const visibleIds = view.visibleFieldIds;
  if (visibleIds) {
    return fields.filter(
      (field) => field.id !== primaryFieldId && visibleIds.includes(field.id)
    );
  }
  return fields
    .filter((field) => field.id !== primaryFieldId)
    .slice(0, DEFAULT_SECONDARY_FIELD_COUNT);
}

const DEFAULT_SECONDARY_FIELD_COUNT = 3;

/** One list row: whole-row link to the row page, title + trailing values. */
function ListRow({
  databaseId,
  primaryField,
  row,
  secondaryFields,
}: {
  databaseId: string;
  primaryField: DatabaseField | undefined;
  row: LocalDatabaseRow;
  secondaryFields: readonly DatabaseField[];
}) {
  const { row: rowTarget } = useDatabasePathTargets(databaseId, row);
  const title = primaryField
    ? formatCellValue(primaryField, row.values[primaryField.id])
    : "";
  if (!rowTarget) {
    return null;
  }
  return (
    <Link
      className="flex items-center gap-3 border-border border-b px-2 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      style={{ height: LIST_ROW_HEIGHT_PX }}
      {...rowTarget}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium text-sm",
          title === "" && "text-muted-foreground"
        )}
      >
        {title === "" ? "Untitled" : title}
      </span>
      {secondaryFields.map((field) => {
        const value = row.values[field.id];
        // Empty trailing cells render nothing at all — no phantom gaps.
        // Formula markers pre-date coercion; the shared view handles them.
        if (
          field.type !== "formula" &&
          isCellEmpty(coerceCellValue(field, value))
        ) {
          return null;
        }
        return (
          <span
            className="flex max-w-48 shrink-0 items-center justify-end text-muted-foreground text-xs"
            key={field.id}
          >
            <DatabaseCellValueView field={field} mode="edit" value={value} />
          </span>
        );
      })}
    </Link>
  );
}

/** Virtualized list body for large row counts (fixed-height rows). */
function VirtualizedListRows({
  databaseId,
  primaryField,
  rows,
  secondaryFields,
}: {
  databaseId: string;
  primaryField: DatabaseField | undefined;
  rows: readonly LocalDatabaseRow[];
  secondaryFields: readonly DatabaseField[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LIST_ROW_HEIGHT_PX,
    overscan: LIST_OVERSCAN,
  });

  return (
    <ScrollArea
      className={cn("w-full", LIST_MAX_HEIGHT_CLASS)}
      viewportRef={scrollRef}
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index];
          if (!row) {
            return null;
          }
          return (
            <div
              className="absolute top-0 left-0 w-full"
              key={row.id}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <ListRow
                databaseId={databaseId}
                primaryField={primaryField}
                row={row}
                secondaryFields={secondaryFields}
              />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/** List view for one database view (see module JSDoc for the row contract). */
export function DatabaseListView({
  database,
  fields,
  mode,
  rows,
  view,
}: DatabaseListViewProps): ReactNode {
  const primaryField = fields.find(
    (field) => field.id === database.primaryFieldId
  );
  const secondaryFields = useMemo(
    () => resolveListSecondaryFields(fields, view, database.primaryFieldId),
    [database.primaryFieldId, fields, view]
  );
  const isSyncedDatabase = database.source?.kind === "connector";

  return (
    <div className="w-full min-w-0 border-border border-t">
      {rows.length > LIST_VIRTUALIZE_THRESHOLD ? (
        <VirtualizedListRows
          databaseId={database.id}
          primaryField={primaryField}
          rows={rows}
          secondaryFields={secondaryFields}
        />
      ) : (
        rows.map((row) => (
          <ListRow
            databaseId={database.id}
            key={row.id}
            primaryField={primaryField}
            row={row}
            secondaryFields={secondaryFields}
          />
        ))
      )}
      {mode === "edit" && !isSyncedDatabase ? (
        // No inline editors in v1: the new row is inserted but nothing
        // focuses — the user opens the row page (or the table view) to type.
        <DatabaseAddRow databaseId={database.id} />
      ) : null}
    </div>
  );
}
