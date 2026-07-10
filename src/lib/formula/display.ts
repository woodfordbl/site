/**
 * Display and text projections of v2 formula values — the `lib/formula`
 * analog of `lib/expr/format-result.ts`. `formulaValueToDisplay` renders any
 * value for a cell/badge; `formulaValueToText` is the plain coercion used by
 * text functions and `+` concatenation (v1's `toText`, extended to dates).
 */

import { format as dateFnsFormat } from "date-fns/format";
import {
  FormulaDate,
  type FormulaError,
  FormulaLambda,
  FormulaRowRef,
  type FormulaValue,
  formulaError,
  LAMBDA_AS_VALUE_MESSAGE,
  RELATIONS_UNAVAILABLE_MESSAGE,
} from "@/lib/formula/values.ts";

/** en-US display formatter: grouping, trailing zeros trimmed, ≤6 decimals. */
const DISPLAY_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

const DATE_ONLY_PATTERN = "yyyy-MM-dd";
const DATE_TIME_PATTERN = "yyyy-MM-dd HH:mm";

/**
 * Display string for a date value: `yyyy-mm-dd` when date-only, otherwise
 * `yyyy-mm-dd HH:mm` in local time.
 */
export function formulaDateToDisplay(value: FormulaDate): string {
  return dateFnsFormat(
    value.date,
    value.dateOnly ? DATE_ONLY_PATTERN : DATE_TIME_PATTERN
  );
}

/**
 * Human display string for any formula value: numbers via `Intl` (en-US,
 * trimmed), booleans "Yes"/"No", blank → "", text as-is, dates per
 * {@link formulaDateToDisplay}, lists comma-joined, rows a placeholder,
 * lambdas "ƒ", errors "⚠ message" (all v1 shapes where shared).
 */
export function formulaValueToDisplay(value: FormulaValue): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return DISPLAY_NUMBER_FORMAT.format(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(formulaValueToDisplay).join(", ");
  }
  if (value instanceof FormulaDate) {
    return formulaDateToDisplay(value);
  }
  if (value instanceof FormulaRowRef) {
    return "[row]";
  }
  if (value instanceof FormulaLambda) {
    return "ƒ";
  }
  return `⚠ ${value.message}`;
}

/**
 * Plain text coercion for concatenation and text functions: blank → "",
 * booleans → "true"/"false", numbers via `String` (v1 rules; display
 * formatting is `format()`'s job). Dates render as their display string.
 * Lists, rows, and lambdas refuse coercion with an error value.
 */
export function formulaValueToText(value: FormulaValue): string | FormulaError {
  if (value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof FormulaDate) {
    return formulaDateToDisplay(value);
  }
  if (Array.isArray(value)) {
    return formulaError("Cannot convert a list to text");
  }
  if (value instanceof FormulaRowRef) {
    return formulaError(RELATIONS_UNAVAILABLE_MESSAGE);
  }
  if (value instanceof FormulaLambda) {
    return formulaError(LAMBDA_AS_VALUE_MESSAGE);
  }
  return value;
}
