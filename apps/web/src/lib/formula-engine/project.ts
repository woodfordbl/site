/**
 * Projection of runtime formula values into the cell-value domain — the
 * shared "what does this value look like as a database cell" rule used by the
 * per-database overlay (`lib/databases/formula-values.ts`) and the
 * incremental engine's value cache (`formula-engine/evaluate-dirty.ts`).
 * Pure: display options carry the row-label callback, nothing reads
 * collections.
 */

import {
  type FormulaValueDisplayOptions,
  formulaDateToDisplay,
  formulaValueToDisplay,
} from "@/lib/formula/display.ts";
import {
  FormulaDate,
  FormulaRowRef,
  type FormulaValue,
  isFormulaError,
} from "@/lib/formula/values.ts";
import type { DatabaseCellValue } from "@/lib/schemas/database.ts";

/** One computed formula cell. */
export interface FormulaCellResult {
  /**
   * The result projected into the cell-value domain: evaluation errors,
   * non-finite numbers, and non-cell shapes (lambdas, rows) collapse to
   * `null` so filters/sorts/aggregates treat them as empty; dates project
   * to their ISO string; lists to their elements' display strings.
   */
  cellValue: DatabaseCellValue;
  /** Human display string (`formulaValueToDisplay`); errors read "⚠ …". */
  display: string;
  /** Whether evaluation produced an error value for this cell. */
  isError: boolean;
}

/** Shared result for cells with no computable value (blank/parse-error). */
export const FORMULA_EMPTY_CELL_RESULT: FormulaCellResult = {
  cellValue: null,
  display: "",
  isError: false,
};

/**
 * Project a formula value into the cell-value domain for the merged-row
 * pipeline: scalars pass through (non-finite numbers → null), dates render
 * `yyyy-mm-dd` when date-only and the full ISO instant otherwise, lists
 * become their elements' display strings (row elements labeled by their
 * target row's title via `display.rowLabel`), a lone row ref becomes its
 * title text, everything else (blank, errors, lambdas, unlabeled rows) is
 * null.
 */
function formulaValueToCellValue(
  value: FormulaValue,
  display: FormulaValueDisplayOptions
): DatabaseCellValue {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof FormulaDate) {
    return value.dateOnly
      ? formulaDateToDisplay(value)
      : value.date.toISOString();
  }
  if (value instanceof FormulaRowRef) {
    return display.rowLabel === undefined ? null : display.rowLabel(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => formulaValueToDisplay(item, display));
  }
  return null;
}

/** A formula value as a {@link FormulaCellResult} (errors → null cells with "⚠ …"). */
export function formulaCellResultOf(
  value: FormulaValue,
  display: FormulaValueDisplayOptions
): FormulaCellResult {
  if (isFormulaError(value)) {
    return {
      cellValue: null,
      display: formulaValueToDisplay(value),
      isError: true,
    };
  }
  return {
    cellValue: formulaValueToCellValue(value, display),
    display: formulaValueToDisplay(value, display),
    isError: false,
  };
}
