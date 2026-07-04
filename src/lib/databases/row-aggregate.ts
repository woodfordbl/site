import {
  cellToPlainText,
  coerceCellValue,
  formatCellValue,
  isCellEmpty,
  toIsoDatePart,
} from "@/lib/databases/cell-values.ts";
import type {
  DatabaseAggregateFn,
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
 */

const PERCENT_SCALE = 100;

function countNonEmpty(
  field: DatabaseField,
  rows: readonly LocalDatabaseRow[]
): number {
  let count = 0;
  for (const row of rows) {
    if (!isCellEmpty(coerceCellValue(field, row.values[field.id]))) {
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
    const cell = coerceCellValue(field, row.values[field.id]);
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
    const cell = coerceCellValue(field, row.values[field.id]);
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
  // `numericValues` keeps only the number-typed results.
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
 * field's number format, and earliest/latest via the field's date format.
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
    case "earliest":
    case "latest":
      return formatCellValue(field, result);
    default:
      return "";
  }
}
