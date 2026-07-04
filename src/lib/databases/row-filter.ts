import {
  coerceCellValue,
  isCellEmpty,
  toIsoDatePart,
} from "@/lib/databases/cell-values.ts";
import { FIELD_TYPE_DEFS } from "@/lib/databases/field-defs.ts";
import { formatExprValueDefault } from "@/lib/expr/evaluate.ts";
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
 * matching what the grid renders (`exprValueToDisplay` in
 * `lib/expr/format-result.ts`): numbers via `Intl` (en-US, grouped, trimmed),
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
    return formatExprValueDefault(cell);
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

function matchIsoDate(
  cell: DatabaseCellValue,
  op: DatabaseFilterOperator,
  target: DatabaseCellValue | undefined
): boolean {
  const targetDate = typeof target === "string" ? toIsoDatePart(target) : "";
  if (targetDate === "") {
    return true;
  }
  const cellDate = typeof cell === "string" ? toIsoDatePart(cell) : "";
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

/**
 * Whether one row satisfies one filter condition against the given field.
 * String comparisons are case-insensitive; date comparisons normalize both
 * sides to `yyyy-mm-dd` and compare lexically; emptiness follows
 * `isCellEmpty`. Operators that don't apply to the field's value kind match.
 */
export function rowMatchesCondition(
  row: LocalDatabaseRow,
  field: DatabaseField,
  condition: DatabaseFilterCondition
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
      return matchIsoDate(cell, op, target);
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
  condition: DatabaseFilterCondition
): boolean {
  const field = fieldsById[condition.fieldId];
  // Stale field reference (field deleted, condition not yet cleaned up):
  // treat as matching so a filter never hides data because of it.
  if (!field) {
    return true;
  }
  return rowMatchesCondition(row, field, condition);
}

function matchesEntry(
  row: LocalDatabaseRow,
  fieldsById: Record<string, DatabaseField>,
  entry: FilterEntry
): boolean {
  if (!isInnerGroup(entry)) {
    return matchesCondition(row, fieldsById, entry);
  }
  if (entry.conditions.length === 0) {
    return true;
  }
  if (entry.op === "and") {
    return entry.conditions.every((condition) =>
      matchesCondition(row, fieldsById, condition)
    );
  }
  return entry.conditions.some((condition) =>
    matchesCondition(row, fieldsById, condition)
  );
}

/**
 * Apply a view filter to a row set, honoring `and`/`or` at the root and
 * inside inner groups (the grammar's two-level cap). Conditions referencing
 * unknown field ids are skipped — treated as matching — so stale references
 * never hide rows. No filter (or an empty one) returns the input unchanged.
 */
export function applyFilter(
  rows: readonly LocalDatabaseRow[],
  fields: readonly DatabaseField[],
  filter?: DatabaseFilterGroup
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
      filter.conditions.every((entry) => matchesEntry(row, fieldsById, entry))
    );
  }
  return rows.filter((row) =>
    filter.conditions.some((entry) => matchesEntry(row, fieldsById, entry))
  );
}
