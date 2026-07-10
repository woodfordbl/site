import { format } from "date-fns/format";

import type {
  DatabaseCellValue,
  LocalDatabase,
} from "@/lib/schemas/database.ts";

/**
 * Row-default resolution: `database.rowDefaults` values are mostly literal
 * cell values, but date fields may hold the {@link ROW_DEFAULT_CREATED_TODAY}
 * sentinel — "the date this row is created" — which resolves per insert.
 */

/** Sentinel date default: resolves to the creation date of each new row. */
export const ROW_DEFAULT_CREATED_TODAY = "@today";

/** True when a date field's default is the created-today sentinel. */
export function isCreatedTodayDefault(
  value: DatabaseCellValue | undefined
): boolean {
  return value === ROW_DEFAULT_CREATED_TODAY;
}

/**
 * Concrete cell values for one new row: literal defaults pass through; the
 * created-today sentinel on date fields becomes `now`'s local `yyyy-MM-dd`.
 */
export function resolveRowDefaultValues(
  database: Pick<LocalDatabase, "fields" | "rowDefaults">,
  now: Date = new Date()
): Record<string, DatabaseCellValue> {
  const defaults = database.rowDefaults;
  if (!defaults) {
    return {};
  }
  const dateFieldIds = new Set(
    database.fields
      .filter((field) => field.type === "date")
      .map((field) => field.id)
  );
  return Object.fromEntries(
    Object.entries(defaults).map(([fieldId, value]) => {
      if (dateFieldIds.has(fieldId) && isCreatedTodayDefault(value)) {
        return [fieldId, format(now, "yyyy-MM-dd")];
      }
      return [fieldId, value];
    })
  );
}
