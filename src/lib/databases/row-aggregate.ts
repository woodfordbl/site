import {
  cellToPlainText,
  coerceCellValue,
  formatCellValue,
  isCellEmpty,
  toIsoDatePart,
} from "@/lib/databases/cell-values.ts";
import { formulaCellErrorDisplay } from "@/lib/databases/formula-values.ts";
import type {
  DatabaseAggregateFn,
  DatabaseCellValue,
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Calculate-row aggregates over a view's (already filtered) row set —
 * Notion's footer taxonomy. Count functions look at cell emptiness; numeric
 * reducers apply to number and formula fields (formula columns aggregate
 * their merged computed values); earliest/latest to date fields only
 * (returning the winning cell's ISO string). Percent functions return 0–1
 * fractions — display formatting is `formatAggregateValue`'s job.
 *
 * LIST-VALUED FORMULA CELLS (show-all rollups, `db()` references): the merged
 * overlay projects a list result to an array of its elements' display strings
 * (`formula-engine/project.ts`), and this module treats those arrays as lists
 * rather than empty cells. The exact semantics shipped:
 *
 * - `countAll` — unchanged: counts rows, never list elements.
 * - `countValues`/`countNotEmpty`/`countEmpty` and the percent pair — a
 *   non-empty list counts as ONE value; empty lists, evaluation-error
 *   markers, and blank cells stay empty.
 * - `countUnique` — a list is one value, keyed by its comma-joined element
 *   text (mirroring the cell's display join), so identical lists dedupe.
 * - `sum`/`average`/`median`/`min`/`max`/`range` — aggregate over the
 *   FLATTENED numeric elements: each element that reads back as an en-US
 *   number (grouping commas stripped) contributes one datum; non-numeric
 *   elements are skipped. `average`/`median` divide over the flattened
 *   numeric-element count, not the row count.
 * - `earliest`/`latest` — date fields only, as before (formula columns
 *   return `null`).
 */

const PERCENT_SCALE = 100;

/**
 * A formula cell's genuine list elements (display strings), or `null` for
 * every other shape — non-formula fields, scalar cells, and the single-item
 * "⚠ …" evaluation-error marker (`formulaCellErrorDisplay`), which keeps
 * reading as an empty cell.
 */
function formulaListElements(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): readonly string[] | null {
  if (field.type !== "formula" || !Array.isArray(value)) {
    return null;
  }
  return formulaCellErrorDisplay(value) === null ? value : null;
}

/**
 * Parse one list element back into a number: the overlay renders numeric
 * elements via en-US `Intl` display (grouping commas, ≤6 decimals), so strip
 * grouping and `Number()` the rest. Non-numeric text returns `null`.
 */
function numericListElement(element: string): number | null {
  const normalized = element.replaceAll(",", "").trim();
  if (normalized === "") {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Whether one cell counts as a value (lists: non-empty counts as one). */
function cellHasValue(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): boolean {
  const list = formulaListElements(field, value);
  if (list !== null) {
    return list.length > 0;
  }
  return !isCellEmpty(coerceCellValue(field, value));
}

function countNonEmpty(
  field: DatabaseField,
  rows: readonly LocalDatabaseRow[]
): number {
  let count = 0;
  for (const row of rows) {
    if (cellHasValue(field, row.values[field.id])) {
      count += 1;
    }
  }
  return count;
}

function countUnique(
  field: DatabaseField,
  rows: readonly LocalDatabaseRow[]
): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const raw = row.values[field.id];
    const list = formulaListElements(field, raw);
    if (list !== null) {
      if (list.length > 0) {
        // One key per list, joined like the cell's display text.
        seen.add(list.join(", "));
      }
      continue;
    }
    const cell = coerceCellValue(field, raw);
    if (!isCellEmpty(cell)) {
      seen.add(cellToPlainText(field, cell));
    }
  }
  return seen.size;
}

function numericValues(
  field: DatabaseField,
  rows: readonly LocalDatabaseRow[]
): number[] {
  const values: number[] = [];
  for (const row of rows) {
    const raw = row.values[field.id];
    const list = formulaListElements(field, raw);
    if (list !== null) {
      for (const element of list) {
        const parsed = numericListElement(element);
        if (parsed !== null) {
          values.push(parsed);
        }
      }
      continue;
    }
    const cell = coerceCellValue(field, raw);
    if (typeof cell === "number") {
      values.push(cell);
    }
  }
  return values;
}

function sumOf(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function minMaxOf(
  values: readonly number[]
): { min: number; max: number } | null {
  if (values.length === 0) {
    return null;
  }
  let min = values[0];
  let max = values[0];
  for (const value of values) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  return { min, max };
}

function computeNumberAggregate(
  fn: "sum" | "average" | "median" | "min" | "max" | "range",
  field: DatabaseField,
  rows: readonly LocalDatabaseRow[]
): number | null {
  // Formula columns qualify over their merged (computed) values —
  // `numericValues` keeps number-typed scalars plus each list cell's
  // flattened numeric elements (module JSDoc has the exact semantics).
  if (field.type !== "number" && field.type !== "formula") {
    return null;
  }
  const values = numericValues(field, rows);
  switch (fn) {
    case "sum":
      return sumOf(values);
    case "average":
      return values.length === 0 ? null : sumOf(values) / values.length;
    case "median":
      return medianOf(values);
    case "min":
      return minMaxOf(values)?.min ?? null;
    case "max":
      return minMaxOf(values)?.max ?? null;
    case "range": {
      const bounds = minMaxOf(values);
      return bounds === null ? null : bounds.max - bounds.min;
    }
    default:
      return null;
  }
}

function computeDateAggregate(
  fn: "earliest" | "latest",
  field: DatabaseField,
  rows: readonly LocalDatabaseRow[]
): string | null {
  if (field.type !== "date") {
    return null;
  }
  let bestRaw: string | null = null;
  let bestDate = "";
  for (const row of rows) {
    const cell = coerceCellValue(field, row.values[field.id]);
    if (typeof cell !== "string") {
      continue;
    }
    const datePart = toIsoDatePart(cell);
    if (datePart === "") {
      continue;
    }
    const wins =
      bestRaw === null ||
      (fn === "earliest" ? datePart < bestDate : datePart > bestDate);
    if (wins) {
      bestRaw = cell;
      bestDate = datePart;
    }
  }
  return bestRaw;
}

/**
 * Compute one Calculate-row aggregate over a row set. Numeric reducers on
 * non-number fields and earliest/latest on non-date fields return `null`;
 * empty inputs return `null` for value reducers (sum returns 0) and 0 for
 * percents. Percent results are 0–1 fractions.
 */
export function computeAggregate(
  fn: DatabaseAggregateFn,
  field: DatabaseField,
  rows: readonly LocalDatabaseRow[]
): number | string | null {
  switch (fn) {
    case "countAll":
      return rows.length;
    case "countValues":
    case "countNotEmpty":
      return countNonEmpty(field, rows);
    case "countEmpty":
      return rows.length - countNonEmpty(field, rows);
    case "countUnique":
      return countUnique(field, rows);
    case "percentEmpty":
      return rows.length === 0
        ? 0
        : (rows.length - countNonEmpty(field, rows)) / rows.length;
    case "percentNotEmpty":
      return rows.length === 0 ? 0 : countNonEmpty(field, rows) / rows.length;
    case "sum":
    case "average":
    case "median":
    case "min":
    case "max":
    case "range":
      return computeNumberAggregate(fn, field, rows);
    case "earliest":
    case "latest":
      return computeDateAggregate(fn, field, rows);
    default:
      return null;
  }
}

/**
 * Display formatting for an aggregate result: percents render as whole-number
 * percentages ("42%"), counts as plain integers, numeric reducers via the
 * field's FULL number display config (`format` + `decimals` + `useGrouping` —
 * a decimals-2 column's sum/average/min/max/range shows 2 decimals), and
 * earliest/latest via the field's date format — except `relative`, which
 * falls back to the default absolute display: "3 days ago" beside an
 * "Earliest" label reads oddly in the footer, and would need the clock tick.
 * `null` results render as `""`.
 */
export function formatAggregateValue(
  fn: DatabaseAggregateFn,
  field: DatabaseField,
  result: number | string | null
): string {
  if (result === null) {
    return "";
  }
  switch (fn) {
    case "countAll":
    case "countValues":
    case "countUnique":
    case "countEmpty":
    case "countNotEmpty":
      return typeof result === "number" ? String(result) : "";
    case "percentEmpty":
    case "percentNotEmpty":
      return typeof result === "number"
        ? `${Math.round(result * PERCENT_SCALE)}%`
        : "";
    case "sum":
    case "average":
    case "median":
    case "min":
    case "max":
    case "range":
      return formatCellValue(field, result);
    case "earliest":
    case "latest":
      return formatCellValue(
        field.type === "date" && field.format === "relative"
          ? { ...field, format: undefined }
          : field,
        result
      );
    default:
      return "";
  }
}
