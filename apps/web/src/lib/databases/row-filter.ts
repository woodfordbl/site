import { addMonths } from "date-fns/addMonths";
import { addWeeks } from "date-fns/addWeeks";
import { endOfMonth } from "date-fns/endOfMonth";
import { endOfWeek } from "date-fns/endOfWeek";
import { format } from "date-fns/format";
import { startOfMonth } from "date-fns/startOfMonth";
import { startOfWeek } from "date-fns/startOfWeek";
import { subDays } from "date-fns/subDays";
import { subMonths } from "date-fns/subMonths";
import { subYears } from "date-fns/subYears";

import {
  coerceCellValue,
  isCellEmpty,
  toIsoDatePart,
} from "@/lib/databases/cell-values.ts";
import {
  FIELD_TYPE_DEFS,
  isRelativeDateOperator,
} from "@/lib/databases/field-defs.ts";
import { formulaValueToDisplay } from "@/lib/formula/display.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilterCondition,
  DatabaseFilterGroup,
  DatabaseFilterInnerGroup,
  DatabaseFilterOperator,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Pure filter evaluation over database rows: one predicate per value kind,
 * composed through the two-level and/or filter grammar
 * (`DatabaseFilterGroup`). Malformed conditions never hide data — they
 * evaluate to a match.
 */

/**
 * Display-text projection of a computed formula cell for string filtering,
 * matching what the grid renders (`formulaValueToDisplay` in
 * `lib/formula/display.ts`): numbers via `Intl` (en-US, grouped, trimmed),
 * booleans "Yes"/"No", strings as-is, anything else "". Without this,
 * numeric/boolean formula results would collapse to "" in `matchString` and
 * be unfilterable.
 */
function formulaCellDisplayText(cell: DatabaseCellValue): string {
  if (
    typeof cell === "string" ||
    typeof cell === "number" ||
    typeof cell === "boolean"
  ) {
    return formulaValueToDisplay(cell);
  }
  return "";
}

function matchString(
  cell: DatabaseCellValue,
  op: DatabaseFilterOperator,
  target: DatabaseCellValue | undefined
): boolean {
  if (typeof target !== "string") {
    return true;
  }
  const cellText = typeof cell === "string" ? cell.toLowerCase() : "";
  const targetText = target.toLowerCase();
  switch (op) {
    case "eq":
      return cellText === targetText;
    case "neq":
      return cellText !== targetText;
    case "contains":
      return cellText.includes(targetText);
    case "notContains":
      return !cellText.includes(targetText);
    case "startsWith":
      return cellText.startsWith(targetText);
    case "endsWith":
      return cellText.endsWith(targetText);
    default:
      return true;
  }
}

function matchNumber(
  cell: DatabaseCellValue,
  op: DatabaseFilterOperator,
  target: DatabaseCellValue | undefined
): boolean {
  if (typeof target !== "number") {
    return true;
  }
  if (typeof cell !== "number") {
    // An empty cell is "not equal" to any target but fails every comparison.
    return op === "neq";
  }
  switch (op) {
    case "eq":
      return cell === target;
    case "neq":
      return cell !== target;
    case "gt":
      return cell > target;
    case "lt":
      return cell < target;
    case "gte":
      return cell >= target;
    case "lte":
      return cell <= target;
    default:
      return true;
  }
}

function matchBoolean(
  cell: DatabaseCellValue,
  op: DatabaseFilterOperator,
  target: DatabaseCellValue | undefined
): boolean {
  if (op !== "eq") {
    return true;
  }
  return (cell === true) === (target === true);
}

function matchOptionId(
  cell: DatabaseCellValue,
  op: DatabaseFilterOperator,
  target: DatabaseCellValue | undefined
): boolean {
  if (typeof target !== "string") {
    return true;
  }
  switch (op) {
    case "eq":
      return cell === target;
    case "neq":
      return cell !== target;
    default:
      return true;
  }
}

function matchOptionIds(
  cell: DatabaseCellValue,
  op: DatabaseFilterOperator,
  target: DatabaseCellValue | undefined
): boolean {
  if (typeof target !== "string") {
    return true;
  }
  const selected = Array.isArray(cell) ? cell : [];
  switch (op) {
    case "contains":
      return selected.includes(target);
    case "notContains":
      return !selected.includes(target);
    default:
      return true;
  }
}

/** Local `yyyy-mm-dd` date part of a `Date` (consistent with `toIsoDatePart`). */
function localIsoDatePart(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Inclusive `[startIso, endIso]` window for a relative date operator,
 * computed from the LOCAL date parts of `now` (matching `toIsoDatePart`'s
 * local-day semantics). Exact windows, all bounds inclusive:
 *
 * - `pastDay` = [today − 1 day, today]
 * - `pastWeek` = [today − 7 days, today]
 * - `pastMonth` = [today − 1 calendar month, today]
 * - `pastYear` = [today − 1 calendar year, today]
 * - `thisWeek` = [start of week, end of week] (date-fns default locale —
 *   weeks start on Sunday)
 * - `thisMonth` = the current calendar month
 * - `nextWeek` = this week's window shifted forward one week
 * - `nextMonth` = the next calendar month
 *
 * Calendar-unit subtraction clamps at short months (date-fns `sub*`, e.g.
 * Mar 31 − 1 month = Feb 28/29). Non-relative operators return `null`.
 */
function relativeDateWindow(
  op: DatabaseFilterOperator,
  now: Date
): [string, string] | null {
  switch (op) {
    case "pastDay":
      return [localIsoDatePart(subDays(now, 1)), localIsoDatePart(now)];
    case "pastWeek":
      return [localIsoDatePart(subDays(now, 7)), localIsoDatePart(now)];
    case "pastMonth":
      return [localIsoDatePart(subMonths(now, 1)), localIsoDatePart(now)];
    case "pastYear":
      return [localIsoDatePart(subYears(now, 1)), localIsoDatePart(now)];
    case "thisWeek":
      return [
        localIsoDatePart(startOfWeek(now)),
        localIsoDatePart(endOfWeek(now)),
      ];
    case "thisMonth":
      return [
        localIsoDatePart(startOfMonth(now)),
        localIsoDatePart(endOfMonth(now)),
      ];
    case "nextWeek":
      return [
        localIsoDatePart(addWeeks(startOfWeek(now), 1)),
        localIsoDatePart(addWeeks(endOfWeek(now), 1)),
      ];
    case "nextMonth": {
      const next = addMonths(now, 1);
      return [
        localIsoDatePart(startOfMonth(next)),
        localIsoDatePart(endOfMonth(next)),
      ];
    }
    default:
      return null;
  }
}

/**
 * Normalized inclusive bounds of a `between` condition value. The value must
 * be a two-string array of parseable dates; swapped bounds normalize to
 * min/max. Anything else is malformed — `null`, fail-open at the caller.
 */
function betweenBounds(
  target: DatabaseCellValue | undefined
): [string, string] | null {
  if (!Array.isArray(target) || target.length !== 2) {
    return null;
  }
  const first = toIsoDatePart(target[0]);
  const second = toIsoDatePart(target[1]);
  if (first === "" || second === "") {
    return null;
  }
  return first <= second ? [first, second] : [second, first];
}

function matchIsoDate(
  cell: DatabaseCellValue,
  op: DatabaseFilterOperator,
  target: DatabaseCellValue | undefined,
  now: () => Date
): boolean {
  const cellDate = typeof cell === "string" ? toIsoDatePart(cell) : "";
  // Window operators (between + relative): inclusive start ≤ cell ≤ end over
  // normalized yyyy-mm-dd parts. Empty cells never fall inside a window; a
  // malformed `between` value skips the condition (fail-open).
  if (op === "between" || isRelativeDateOperator(op)) {
    const window =
      op === "between" ? betweenBounds(target) : relativeDateWindow(op, now());
    if (!window) {
      return true;
    }
    return cellDate !== "" && window[0] <= cellDate && cellDate <= window[1];
  }
  const targetDate = typeof target === "string" ? toIsoDatePart(target) : "";
  if (targetDate === "") {
    return true;
  }
  if (cellDate === "") {
    return false;
  }
  // Normalized yyyy-mm-dd strings compare correctly as plain strings.
  switch (op) {
    case "eq":
      return cellDate === targetDate;
    case "before":
      return cellDate < targetDate;
    case "after":
      return cellDate > targetDate;
    case "onOrBefore":
      return cellDate <= targetDate;
    case "onOrAfter":
      return cellDate >= targetDate;
    default:
      return true;
  }
}

/** Options threaded through filter evaluation. */
export interface RowFilterOptions {
  /**
   * Injected clock for relative date operators (`pastDay`…`nextMonth`); omit
   * for real time. Mirrors the injected-clock convention of
   * `FormatCellValueOptions.now` so tests stay deterministic.
   */
  now?: () => Date;
}

/**
 * Whether one row satisfies one filter condition against the given field.
 * String comparisons are case-insensitive; date comparisons normalize both
 * sides to `yyyy-mm-dd` and compare lexically (`between` and the relative
 * window operators check inclusive `start ≤ cell ≤ end`, relative windows
 * against `opts.now`); emptiness follows `isCellEmpty`. Operators that don't
 * apply to the field's value kind match.
 */
export function rowMatchesCondition(
  row: LocalDatabaseRow,
  field: DatabaseField,
  condition: DatabaseFilterCondition,
  opts?: RowFilterOptions
): boolean {
  const cell = coerceCellValue(field, row.values[field.id]);
  const op = condition.operator;
  if (op === "isEmpty") {
    return isCellEmpty(cell);
  }
  if (op === "isNotEmpty") {
    return !isCellEmpty(cell);
  }
  const target = condition.value;
  switch (FIELD_TYPE_DEFS[field.type].valueKind) {
    case "string":
      // Formula results are mixed-type (string/number/boolean); filter them
      // on the display text the grid shows for the cell.
      return matchString(
        field.type === "formula" ? formulaCellDisplayText(cell) : cell,
        op,
        target
      );
    case "number":
      return matchNumber(cell, op, target);
    case "boolean":
      return matchBoolean(cell, op, target);
    case "optionId":
      return matchOptionId(cell, op, target);
    case "optionIds":
      return matchOptionIds(cell, op, target);
    case "isoDate":
      return matchIsoDate(cell, op, target, opts?.now ?? (() => new Date()));
    default:
      return true;
  }
}

type FilterEntry = DatabaseFilterCondition | DatabaseFilterInnerGroup;

function isInnerGroup(entry: FilterEntry): entry is DatabaseFilterInnerGroup {
  return "conditions" in entry;
}

function matchesCondition(
  row: LocalDatabaseRow,
  fieldsById: Record<string, DatabaseField>,
  condition: DatabaseFilterCondition,
  opts?: RowFilterOptions
): boolean {
  const field = fieldsById[condition.fieldId];
  // Stale field reference (field deleted, condition not yet cleaned up):
  // treat as matching so a filter never hides data because of it.
  if (!field) {
    return true;
  }
  return rowMatchesCondition(row, field, condition, opts);
}

function matchesEntry(
  row: LocalDatabaseRow,
  fieldsById: Record<string, DatabaseField>,
  entry: FilterEntry,
  opts?: RowFilterOptions
): boolean {
  if (!isInnerGroup(entry)) {
    return matchesCondition(row, fieldsById, entry, opts);
  }
  if (entry.conditions.length === 0) {
    return true;
  }
  if (entry.op === "and") {
    return entry.conditions.every((condition) =>
      matchesCondition(row, fieldsById, condition, opts)
    );
  }
  return entry.conditions.some((condition) =>
    matchesCondition(row, fieldsById, condition, opts)
  );
}

/**
 * Apply a view filter to a row set, honoring `and`/`or` at the root and
 * inside inner groups (the grammar's two-level cap). Conditions referencing
 * unknown field ids are skipped — treated as matching — so stale references
 * never hide rows. No filter (or an empty one) returns the input unchanged.
 * Relative date operators evaluate against `opts.now` (default: real time) —
 * callers with such filters must re-run on their clock tick.
 */
export function applyFilter(
  rows: readonly LocalDatabaseRow[],
  fields: readonly DatabaseField[],
  filter?: DatabaseFilterGroup,
  opts?: RowFilterOptions
): LocalDatabaseRow[] {
  if (!filter || filter.conditions.length === 0) {
    return [...rows];
  }
  const fieldsById: Record<string, DatabaseField> = {};
  for (const field of fields) {
    fieldsById[field.id] = field;
  }
  if (filter.op === "and") {
    return rows.filter((row) =>
      filter.conditions.every((entry) =>
        matchesEntry(row, fieldsById, entry, opts)
      )
    );
  }
  return rows.filter((row) =>
    filter.conditions.some((entry) =>
      matchesEntry(row, fieldsById, entry, opts)
    )
  );
}
