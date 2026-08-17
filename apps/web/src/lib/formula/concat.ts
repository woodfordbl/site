/**
 * @fileoverview Runtime semantics for the two operators that join text: `&`
 * and `+`.
 *
 * They differ deliberately. `&` is spreadsheet concatenation — every value
 * with a text form coerces (number, boolean, date) and blank reads as the
 * empty string — so only values with no text form (lists, rows) reject.
 * `+` joins only when a side is ALREADY text, and rejects blank outright, so
 * a missing number never silently becomes "". The checker mirrors both
 * statically.
 */
import { formulaValueToText } from "@/lib/formula/display.ts";
import {
  type FormulaValue,
  formulaError,
  formulaValueTypeName,
} from "@/lib/formula/values.ts";

/**
 * `&` text concatenation: both sides coerce through `formulaValueToText`, so
 * numbers, booleans, and dates read naturally and blank reads as the empty
 * string (the spreadsheet rule — unlike `+`, which rejects blank operands).
 * Lists and rows still error, matching the text functions.
 */
export function applyFormulaConcat(
  left: FormulaValue,
  right: FormulaValue
): FormulaValue {
  const leftText = formulaValueToText(left);
  if (typeof leftText !== "string") {
    return leftText;
  }
  const rightText = formulaValueToText(right);
  if (typeof rightText !== "string") {
    return rightText;
  }
  return leftText + rightText;
}

/**
 * `+`: numeric addition, or text joining when either side is already text.
 * Blank rejects rather than coercing — the asymmetry with `&` above is the
 * point, and `date + number` routes users to `dateAdd()`.
 */
export function applyFormulaPlus(
  left: FormulaValue,
  right: FormulaValue
): FormulaValue {
  const cannotAdd = () =>
    formulaError(
      `Cannot add ${formulaValueTypeName(left)} and ${formulaValueTypeName(right)}`
    );
  if (left === null || right === null) {
    return cannotAdd();
  }
  if (typeof left === "string" || typeof right === "string") {
    const leftText = formulaValueToText(left);
    if (typeof leftText !== "string") {
      return leftText;
    }
    const rightText = formulaValueToText(right);
    if (typeof rightText !== "string") {
      return rightText;
    }
    return leftText + rightText;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left + right;
  }
  // Includes date + number: dateAdd() exists for that.
  return cannotAdd();
}
