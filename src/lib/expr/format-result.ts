/**
 * Display and cell-value projections of expression results, for rendering
 * formula cells / template tokens and for filter/sort interop with the
 * database value pipeline.
 */

import {
  type ExprValue,
  formatExprValueDefault,
  isExprError,
} from "@/lib/expr/evaluate.ts";
import type { DatabaseCellValue } from "@/lib/schemas/database.ts";

/**
 * Human display string for an expression result: numbers via `Intl` (en-US,
 * trimmed), booleans "Yes"/"No", `null` → `""`, strings as-is, and errors as
 * their message prefixed with "⚠ ".
 */
export function exprValueToDisplay(value: ExprValue): string {
  if (isExprError(value)) {
    return `⚠ ${value.message}`;
  }
  return formatExprValueDefault(value);
}

/**
 * Project an expression result into the database cell-value domain so
 * formula results can flow through the existing filter/sort comparators.
 * Errors and non-finite numbers collapse to `null` (empty).
 */
export function exprValueToCellValue(
  value: ExprValue
): DatabaseCellValue | null {
  if (isExprError(value)) {
    return null;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }
  if (Array.isArray(value)) {
    // A list projects to a multiSelect-shaped cell only when every element is
    // text; otherwise there's no faithful scalar cell value (collapse to empty).
    return value.every((element) => typeof element === "string")
      ? (value as string[])
      : null;
  }
  return value;
}
