import {
  cellToPlainText,
  coerceCellValue,
  isCellEmpty,
  toIsoDatePart,
} from "@/lib/databases/cell-values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseSort,
  DatabaseView,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Pure row ordering: type-aware cell comparison, stable multi-key view
 * sorting, and the manual (drag) order used when a view has no sorts.
 */

/** Case-insensitive text collation for string-ish cell comparison. */
const TEXT_COLLATOR = new Intl.Collator("en-US", { sensitivity: "base" });

function optionIndex(field: DatabaseField, optionId: string): number {
  if (field.type !== "select" && field.type !== "multiSelect") {
    return -1;
  }
  return field.options.findIndex((option) => option.id === optionId);
}

function compareSelect(
  field: DatabaseField,
  a: DatabaseCellValue,
  b: DatabaseCellValue
): number {
  const aIndex = typeof a === "string" ? optionIndex(field, a) : -1;
  const bIndex = typeof b === "string" ? optionIndex(field, b) : -1;
  if (aIndex !== -1 && bIndex !== -1) {
    return aIndex - bIndex;
  }
  // Stale option ids fall back to name comparison so ordering stays total.
  return TEXT_COLLATOR.compare(
    cellToPlainText(field, a),
    cellToPlainText(field, b)
  );
}

function compareIsoDates(a: string, b: string): number {
  const aDate = toIsoDatePart(a);
  const bDate = toIsoDatePart(b);
  if (aDate < bDate) {
    return -1;
  }
  if (aDate > bDate) {
    return 1;
  }
  return 0;
}

function compareNonEmpty(
  field: DatabaseField,
  a: DatabaseCellValue,
  b: DatabaseCellValue
): number {
  switch (field.type) {
    case "text":
    case "url":
      return TEXT_COLLATOR.compare(
        typeof a === "string" ? a : "",
        typeof b === "string" ? b : ""
      );
    case "number": {
      const aNumber = typeof a === "number" ? a : 0;
      const bNumber = typeof b === "number" ? b : 0;
      return aNumber - bNumber;
    }
    case "checkbox":
      return (a === true ? 1 : 0) - (b === true ? 1 : 0);
    case "select":
      return compareSelect(field, a, b);
    case "multiSelect":
      return TEXT_COLLATOR.compare(
        cellToPlainText(field, a),
        cellToPlainText(field, b)
      );
    case "date":
      return compareIsoDates(
        typeof a === "string" ? a : "",
        typeof b === "string" ? b : ""
      );
    default:
      return 0;
  }
}

/**
 * Type-aware cell comparison for one field: text/url via case-insensitive
 * collation, numbers numerically, checkbox false-before-true, select by
 * option order (stale ids by name), multi-select by joined option names,
 * dates lexically on the `yyyy-mm-dd` part. Empty cells always sort last —
 * `applySorts` keeps them last regardless of direction.
 */
export function compareCellValues(
  field: DatabaseField,
  a: DatabaseCellValue | undefined,
  b: DatabaseCellValue | undefined
): number {
  const aCell = coerceCellValue(field, a);
  const bCell = coerceCellValue(field, b);
  const aEmpty = isCellEmpty(aCell);
  const bEmpty = isCellEmpty(bCell);
  if (aEmpty || bEmpty) {
    if (aEmpty && bEmpty) {
      return 0;
    }
    return aEmpty ? 1 : -1;
  }
  return compareNonEmpty(field, aCell, bCell);
}

function compareForSort(
  field: DatabaseField,
  direction: "asc" | "desc",
  aCell: DatabaseCellValue,
  bCell: DatabaseCellValue
): number {
  const aEmpty = isCellEmpty(aCell);
  const bEmpty = isCellEmpty(bCell);
  if (aEmpty || bEmpty) {
    if (aEmpty && bEmpty) {
      return 0;
    }
    // Empties last regardless of direction.
    return aEmpty ? 1 : -1;
  }
  const result = compareNonEmpty(field, aCell, bCell);
  return direction === "desc" ? -result : result;
}

/**
 * Stable multi-key sort per the view's sort list. Direction flips value
 * comparisons only — empty cells stay last either way. Sorts referencing
 * unknown field ids are skipped; no applicable sorts returns the input
 * order unchanged.
 */
export function applySorts(
  rows: readonly LocalDatabaseRow[],
  fields: readonly DatabaseField[],
  sorts?: readonly DatabaseSort[]
): LocalDatabaseRow[] {
  if (!sorts || sorts.length === 0) {
    return [...rows];
  }
  const fieldsById: Record<string, DatabaseField> = {};
  for (const field of fields) {
    fieldsById[field.id] = field;
  }
  const resolved: { field: DatabaseField; direction: "asc" | "desc" }[] = [];
  for (const sort of sorts) {
    const field = fieldsById[sort.fieldId];
    if (field) {
      resolved.push({ field, direction: sort.direction });
    }
  }
  if (resolved.length === 0) {
    return [...rows];
  }
  // Array.prototype.sort is stable, so ties fall through to input order.
  return [...rows].sort((a, b) => {
    for (const { field, direction } of resolved) {
      const result = compareForSort(
        field,
        direction,
        coerceCellValue(field, a.values[field.id]),
        coerceCellValue(field, b.values[field.id])
      );
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  });
}

/**
 * Manual (drag) order comparator: sparse `order` ascending with
 * missing-order rows last, then `createdAt`, then `id` — a deterministic
 * total order for any row set.
 */
export function compareManualOrder(
  a: LocalDatabaseRow,
  b: LocalDatabaseRow
): number {
  const aOrder = a.order;
  const bOrder = b.order;
  if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  if ((aOrder === undefined) !== (bOrder === undefined)) {
    return aOrder === undefined ? 1 : -1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}

/**
 * Order rows for a view: the view's sorts when present, otherwise manual
 * drag order (`compareManualOrder`).
 */
export function sortRowsForView(
  rows: readonly LocalDatabaseRow[],
  fields: readonly DatabaseField[],
  view: DatabaseView
): LocalDatabaseRow[] {
  if (view.sorts && view.sorts.length > 0) {
    return applySorts(rows, fields, view.sorts);
  }
  return [...rows].sort(compareManualOrder);
}
