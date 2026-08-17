/**
 * @fileoverview The operator reference: what the editor's Operators list
 * shows. Every operator the language accepts appears here exactly as it is
 * typed, grouped by the section it is listed under.
 *
 * Separate from the function catalog so both stay inside the repository's
 * file-length cap; the parser, not this list, defines precedence.
 */

/** Section an operator is listed under in the docs UI. */
export type FormulaOperatorCategory =
  | "arithmetic"
  | "comparison"
  | "logic"
  | "text";

/** One documented operator row: symbol as typed, plus a one-line description. */
export interface FormulaOperatorCatalogEntry {
  readonly category: FormulaOperatorCategory;
  /** One sentence, sentence case. */
  readonly description: string;
  /** The operator exactly as typed in an expression. */
  readonly symbol: string;
}

/** Every formula operator, grouped for the reference list in the editor. */
export const FORMULA_OPERATOR_CATALOG: readonly FormulaOperatorCatalogEntry[] =
  [
    {
      symbol: "+",
      description: "Adds numbers, or joins text when either side is text.",
      category: "arithmetic",
    },
    {
      symbol: "-",
      description: "Subtracts one number from another (or negates a number).",
      category: "arithmetic",
    },
    {
      symbol: "*",
      description: "Multiplies two numbers.",
      category: "arithmetic",
    },
    {
      symbol: "/",
      description: "Divides one number by another.",
      category: "arithmetic",
    },
    {
      symbol: "%",
      description: "Returns the remainder after division.",
      category: "arithmetic",
    },
    {
      symbol: "^",
      description: "Raises a number to a power (right-associative).",
      category: "arithmetic",
    },
    {
      symbol: "&",
      description:
        "Joins values as text — numbers, dates, and booleans read naturally, blank reads as nothing.",
      category: "text",
    },
    {
      symbol: "==",
      description: "True when both values are equal.",
      category: "comparison",
    },
    {
      symbol: "!=",
      description: "True when the values are not equal.",
      category: "comparison",
    },
    {
      symbol: "<",
      description: "True when the left value is smaller (dates compare too).",
      category: "comparison",
    },
    {
      symbol: "<=",
      description: "True when the left value is smaller or equal.",
      category: "comparison",
    },
    {
      symbol: ">",
      description: "True when the left value is larger (dates compare too).",
      category: "comparison",
    },
    {
      symbol: ">=",
      description: "True when the left value is larger or equal.",
      category: "comparison",
    },
    {
      symbol: "and",
      description: "True when both sides are true.",
      category: "logic",
    },
    {
      symbol: "or",
      description: "True when either side is true.",
      category: "logic",
    },
    {
      symbol: "not",
      description: "Inverts a true/false value.",
      category: "logic",
    },
    {
      symbol: "??",
      description: "Falls back to the right side when the left is blank.",
      category: "logic",
    },
  ];
