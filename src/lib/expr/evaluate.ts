/**
 * Evaluator for the shared expression language (`lib/expr`). Walks a parsed
 * AST against an injected property scope and produces a value — never
 * throwing: every failure (division by zero, unknown property/function, type
 * mismatch) is a distinguished {@link ExprError} value that propagates
 * through operators and function arguments.
 */

import { addDays } from "date-fns/addDays";
import { addMonths } from "date-fns/addMonths";
import { addYears } from "date-fns/addYears";
import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import { differenceInCalendarMonths } from "date-fns/differenceInCalendarMonths";
import { differenceInCalendarYears } from "date-fns/differenceInCalendarYears";
import { format as dateFnsFormat } from "date-fns/format";
import { toIsoDatePart } from "@/lib/databases/cell-values.ts";
import type { ExprBinaryOp, ExprNode } from "@/lib/expr/parse.ts";

/**
 * A distinguished error value. Evaluation never throws — errors flow through
 * operators and functions as values (any `ExprError` operand yields that
 * error) so a bad formula degrades to an inline message, never a crash.
 */
export interface ExprError {
  readonly message: string;
  readonly type: "expr-error";
}

/** A successfully computed expression value (no error). */
export type ExprPlainValue = number | string | boolean | null;

/**
 * Any expression result. ISO date strings are plain strings; comparison
 * operators handle them date-aware (lexically, which is order-correct for
 * `yyyy-mm-dd`).
 */
export type ExprValue = ExprPlainValue | ExprError;

/**
 * The evaluation environment. `getProperty` resolves `thisPage.X` /
 * `thisRow.X` references by name (implementations should match
 * case-insensitively; see `createRowScope`). `now` is the injected clock for
 * `now()`/`today()` — when absent, a fixed epoch keeps pure callers
 * deterministic; interactive callers pass the real clock.
 */
export interface ExprScope {
  getProperty(name: string): ExprValue;
  now?(): Date;
}

/** Create an {@link ExprError} value. */
export function exprError(message: string): ExprError {
  return { type: "expr-error", message };
}

/** Whether an expression result is an {@link ExprError}. */
export function isExprError(value: ExprValue): value is ExprError {
  return typeof value === "object" && value !== null;
}

/**
 * The fixed instant `now()`/`today()` report when the scope injects no clock,
 * chosen at UTC noon so the local date part is stable across most timezones.
 */
export const EXPR_FIXED_NOW_ISO = "2020-01-01T12:00:00.000Z";

/** en-US display formatter: grouping, trailing zeros trimmed, ≤6 decimals. */
const DISPLAY_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

const ISO_DATE_PATTERN = "yyyy-MM-dd";

/**
 * Field-agnostic default display for a plain expression value: numbers via
 * `Intl` (en-US, trimmed), booleans "Yes"/"No", `null` → `""`, strings as-is.
 * Shared by the `format()` expression function and `exprValueToDisplay`.
 */
export function formatExprValueDefault(value: ExprPlainValue): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return DISPLAY_NUMBER_FORMAT.format(value);
  }
  return value;
}

/** Human-readable type name for error messages. */
function typeName(value: ExprPlainValue): string {
  if (value === null) {
    return "empty";
  }
  if (typeof value === "string") {
    return "text";
  }
  return typeof value;
}

/**
 * Plain string coercion for concatenation and string functions: `null` → "",
 * booleans → "true"/"false", numbers via `String`. (Display formatting is
 * `format()`'s job, not coercion's.)
 */
function toText(value: ExprPlainValue): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

function parseDateArg(value: ExprPlainValue, fnName: string): Date | ExprError {
  if (typeof value !== "string") {
    return exprError(
      `${fnName}() expects a date string, got ${typeName(value)}`
    );
  }
  const datePart = toIsoDatePart(value);
  if (datePart === "") {
    return exprError(`${fnName}(): invalid date "${value}"`);
  }
  const [year, month, day] = datePart.split("-").map(Number);
  // Local-time construction from parts so the calendar day never shifts
  // across timezones (same convention as `lib/databases/cell-values.ts`).
  return new Date(year, month - 1, day);
}

type DateUnit = "days" | "months" | "years";

const DATE_UNITS = new Map<string, DateUnit>([
  ["day", "days"],
  ["days", "days"],
  ["month", "months"],
  ["months", "months"],
  ["year", "years"],
  ["years", "years"],
]);

function parseUnitArg(
  value: ExprPlainValue,
  fnName: string
): DateUnit | ExprError {
  const unit =
    typeof value === "string"
      ? DATE_UNITS.get(value.trim().toLowerCase())
      : undefined;
  if (unit === undefined) {
    return exprError(
      `${fnName}(): unknown unit ${JSON.stringify(value)} — use "days", "months", or "years"`
    );
  }
  return unit;
}

function requireNumber(
  value: ExprPlainValue,
  fnName: string
): number | ExprError {
  if (typeof value !== "number") {
    return exprError(`${fnName}() expects a number, got ${typeName(value)}`);
  }
  return value;
}

function requireString(
  value: ExprPlainValue,
  fnName: string
): string | ExprError {
  if (typeof value !== "string") {
    return exprError(`${fnName}() expects text, got ${typeName(value)}`);
  }
  return value;
}

function scopeNow(scope: ExprScope): Date {
  return scope.now ? scope.now() : new Date(EXPR_FIXED_NOW_ISO);
}

function applyNumeric(
  fnName: string,
  value: ExprPlainValue,
  apply: (n: number) => number
): ExprValue {
  const n = requireNumber(value, fnName);
  return typeof n === "number" ? apply(n) : n;
}

function reduceNumbers(
  fnName: string,
  args: ExprPlainValue[],
  reduce: (a: number, b: number) => number
): ExprValue {
  let result: number | null = null;
  for (const arg of args) {
    const n = requireNumber(arg, fnName);
    if (typeof n !== "number") {
      return n;
    }
    result = result === null ? n : reduce(result, n);
  }
  return result;
}

function evalRound(args: ExprPlainValue[]): ExprValue {
  const value = requireNumber(args[0], "round");
  if (typeof value !== "number") {
    return value;
  }
  if (args.length === 1) {
    return Math.round(value);
  }
  const digits = requireNumber(args[1], "round");
  if (typeof digits !== "number") {
    return digits;
  }
  const factor = 10 ** Math.trunc(digits);
  return Math.round(value * factor) / factor;
}

function evalFormatDate(args: ExprPlainValue[]): ExprValue {
  const date = parseDateArg(args[0], "formatDate");
  if (date instanceof Date === false) {
    return date;
  }
  const pattern = requireString(args[1], "formatDate");
  if (typeof pattern !== "string") {
    return pattern;
  }
  try {
    return dateFnsFormat(date, pattern);
  } catch {
    return exprError(`formatDate(): invalid format pattern "${pattern}"`);
  }
}

function evalDateAdd(args: ExprPlainValue[]): ExprValue {
  const date = parseDateArg(args[0], "dateAdd");
  if (date instanceof Date === false) {
    return date;
  }
  const amount = requireNumber(args[1], "dateAdd");
  if (typeof amount !== "number") {
    return amount;
  }
  const unit = parseUnitArg(args[2], "dateAdd");
  if (typeof unit !== "string") {
    return unit;
  }
  let shifted: Date;
  if (unit === "days") {
    shifted = addDays(date, amount);
  } else if (unit === "months") {
    shifted = addMonths(date, amount);
  } else {
    shifted = addYears(date, amount);
  }
  return dateFnsFormat(shifted, ISO_DATE_PATTERN);
}

function evalDateDiff(args: ExprPlainValue[]): ExprValue {
  const a = parseDateArg(args[0], "dateDiff");
  if (a instanceof Date === false) {
    return a;
  }
  const b = parseDateArg(args[1], "dateDiff");
  if (b instanceof Date === false) {
    return b;
  }
  const unit = parseUnitArg(args[2], "dateDiff");
  if (typeof unit !== "string") {
    return unit;
  }
  if (unit === "days") {
    return differenceInCalendarDays(a, b);
  }
  if (unit === "months") {
    return differenceInCalendarMonths(a, b);
  }
  return differenceInCalendarYears(a, b);
}

interface ExprFunctionDef {
  apply(args: ExprPlainValue[], scope: ExprScope): ExprValue;
  maxArgs: number;
  minArgs: number;
}

/**
 * Built-in function table, keyed by lowercased name (lookup is
 * case-insensitive). `if(…)` is not here — it evaluates lazily in
 * {@link evaluateExpression} so only the taken branch runs.
 */
const EXPR_FUNCTIONS = new Map<string, ExprFunctionDef>([
  [
    "concat",
    {
      minArgs: 1,
      maxArgs: Number.POSITIVE_INFINITY,
      apply: (args) => args.map(toText).join(""),
    },
  ],
  ["round", { minArgs: 1, maxArgs: 2, apply: (args) => evalRound(args) }],
  [
    "floor",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => applyNumeric("floor", args[0], Math.floor),
    },
  ],
  [
    "ceil",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => applyNumeric("ceil", args[0], Math.ceil),
    },
  ],
  [
    "abs",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => applyNumeric("abs", args[0], Math.abs),
    },
  ],
  [
    "min",
    {
      minArgs: 1,
      maxArgs: Number.POSITIVE_INFINITY,
      apply: (args) => reduceNumbers("min", args, Math.min),
    },
  ],
  [
    "max",
    {
      minArgs: 1,
      maxArgs: Number.POSITIVE_INFINITY,
      apply: (args) => reduceNumbers("max", args, Math.max),
    },
  ],
  ["len", { minArgs: 1, maxArgs: 1, apply: (args) => toText(args[0]).length }],
  [
    "lower",
    { minArgs: 1, maxArgs: 1, apply: (args) => toText(args[0]).toLowerCase() },
  ],
  [
    "upper",
    { minArgs: 1, maxArgs: 1, apply: (args) => toText(args[0]).toUpperCase() },
  ],
  ["trim", { minArgs: 1, maxArgs: 1, apply: (args) => toText(args[0]).trim() }],
  [
    "contains",
    {
      minArgs: 2,
      maxArgs: 2,
      apply: (args) => toText(args[0]).includes(toText(args[1])),
    },
  ],
  [
    "replace",
    {
      // Replaces ALL occurrences of a literal (non-regex) substring.
      minArgs: 3,
      maxArgs: 3,
      apply: (args) =>
        toText(args[0]).replaceAll(toText(args[1]), toText(args[2])),
    },
  ],
  [
    "empty",
    {
      // Matches `isCellEmpty` semantics: null and blank strings are empty;
      // 0 and false are values.
      minArgs: 1,
      maxArgs: 1,
      apply: (args) =>
        args[0] === null ||
        (typeof args[0] === "string" && args[0].trim().length === 0),
    },
  ],
  [
    "format",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => formatExprValueDefault(args[0]),
    },
  ],
  [
    "formatdate",
    { minArgs: 2, maxArgs: 2, apply: (args) => evalFormatDate(args) },
  ],
  [
    "now",
    {
      minArgs: 0,
      maxArgs: 0,
      apply: (_args, scope) => scopeNow(scope).toISOString(),
    },
  ],
  [
    "today",
    {
      // Local calendar date of the clock instant, as yyyy-mm-dd.
      minArgs: 0,
      maxArgs: 0,
      apply: (_args, scope) => dateFnsFormat(scopeNow(scope), ISO_DATE_PATTERN),
    },
  ],
  ["dateadd", { minArgs: 3, maxArgs: 3, apply: (args) => evalDateAdd(args) }],
  ["datediff", { minArgs: 3, maxArgs: 3, apply: (args) => evalDateDiff(args) }],
]);

/** Function names whose results depend on the clock (see {@link isVolatileExpression}). */
const VOLATILE_FUNCTION_NAMES = new Set(["now", "today"]);

function arityMessage(name: string, def: ExprFunctionDef, got: number): string {
  if (def.minArgs === def.maxArgs) {
    const plural = def.minArgs === 1 ? "argument" : "arguments";
    return `${name}() expects ${def.minArgs} ${plural}, got ${got}`;
  }
  if (def.maxArgs === Number.POSITIVE_INFINITY) {
    return `${name}() expects at least ${def.minArgs} argument(s), got ${got}`;
  }
  return `${name}() expects ${def.minArgs} to ${def.maxArgs} arguments, got ${got}`;
}

function valuesEqual(left: ExprPlainValue, right: ExprPlainValue): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  if (typeof left !== typeof right) {
    // Type-aware equality: mismatched types are unequal, not an error, so
    // `thisPage.Status == "Done"` stays false (not broken) on empty cells.
    return false;
  }
  return left === right;
}

function compareOrdered(
  op: "<" | "<=" | ">" | ">=",
  left: ExprPlainValue,
  right: ExprPlainValue
): ExprValue {
  const comparable =
    (typeof left === "number" && typeof right === "number") ||
    (typeof left === "string" && typeof right === "string");
  if (!comparable) {
    return exprError(`Cannot compare ${typeName(left)} and ${typeName(right)}`);
  }
  // Strings compare lexically, which is date-aware for matching
  // `yyyy-mm-dd`-shaped ISO strings (ISO order == lexical order).
  switch (op) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    default:
      return left >= right;
  }
}

function applyArithmetic(
  op: "-" | "*" | "/" | "%",
  left: ExprPlainValue,
  right: ExprPlainValue
): ExprValue {
  if (typeof left !== "number" || typeof right !== "number") {
    return exprError(
      `Cannot apply "${op}" to ${typeName(left)} and ${typeName(right)}`
    );
  }
  if ((op === "/" || op === "%") && right === 0) {
    return exprError("Division by zero");
  }
  switch (op) {
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    default:
      return left % right;
  }
}

function applyBinary(
  op: Exclude<ExprBinaryOp, "and" | "or">,
  left: ExprPlainValue,
  right: ExprPlainValue
): ExprValue {
  switch (op) {
    case "+": {
      if (typeof left === "string" || typeof right === "string") {
        return toText(left) + toText(right);
      }
      if (typeof left === "number" && typeof right === "number") {
        return left + right;
      }
      return exprError(`Cannot add ${typeName(left)} and ${typeName(right)}`);
    }
    case "-":
    case "*":
    case "/":
    case "%":
      return applyArithmetic(op, left, right);
    case "==":
      return valuesEqual(left, right);
    case "!=":
      return !valuesEqual(left, right);
    default:
      return compareOrdered(op, left, right);
  }
}

function requireBoolean(value: ExprValue, op: string): boolean | ExprError {
  if (isExprError(value)) {
    return value;
  }
  if (typeof value !== "boolean") {
    return exprError(`"${op}" expects a boolean, got ${typeName(value)}`);
  }
  return value;
}

function evalLogical(
  op: "and" | "or",
  leftNode: ExprNode,
  rightNode: ExprNode,
  scope: ExprScope
): ExprValue {
  const left = requireBoolean(evaluateExpression(leftNode, scope), op);
  if (typeof left !== "boolean") {
    return left;
  }
  // Short-circuit: the untaken side is never evaluated, so its errors
  // (e.g. division by zero) cannot leak into the result.
  if (op === "and" && !left) {
    return false;
  }
  if (op === "or" && left) {
    return true;
  }
  return requireBoolean(evaluateExpression(rightNode, scope), op);
}

function evalUnary(op: "-" | "not", operand: ExprValue): ExprValue {
  if (isExprError(operand)) {
    return operand;
  }
  if (op === "-") {
    if (typeof operand !== "number") {
      return exprError(`Cannot negate ${typeName(operand)}`);
    }
    return -operand;
  }
  if (typeof operand !== "boolean") {
    return exprError(`"not" expects a boolean, got ${typeName(operand)}`);
  }
  return !operand;
}

function evalIf(args: ExprNode[], scope: ExprScope): ExprValue {
  if (args.length !== 3) {
    return exprError(`if() expects 3 arguments, got ${args.length}`);
  }
  const condition = requireBoolean(evaluateExpression(args[0], scope), "if");
  if (typeof condition !== "boolean") {
    return condition;
  }
  // Lazy: only the taken branch evaluates, so `if(x != 0, 1 / x, 0)` is safe.
  return evaluateExpression(condition ? args[1] : args[2], scope);
}

function evalCall(name: string, args: ExprNode[], scope: ExprScope): ExprValue {
  const lower = name.toLowerCase();
  if (lower === "if") {
    return evalIf(args, scope);
  }
  const def = EXPR_FUNCTIONS.get(lower);
  if (def === undefined) {
    return exprError(`Unknown function "${name}"`);
  }
  if (args.length < def.minArgs || args.length > def.maxArgs) {
    return exprError(arityMessage(name, def, args.length));
  }
  const values: ExprPlainValue[] = [];
  for (const arg of args) {
    const value = evaluateExpression(arg, scope);
    if (isExprError(value)) {
      return value;
    }
    values.push(value);
  }
  return def.apply(values, scope);
}

/**
 * Evaluate a parsed expression against a scope. Never throws — all failure
 * modes surface as {@link ExprError} values, and any error operand propagates
 * outward (except through the untaken branches of `and`/`or`/`if`, which
 * short-circuit).
 */
export function evaluateExpression(ast: ExprNode, scope: ExprScope): ExprValue {
  switch (ast.kind) {
    case "literal":
      return ast.value;
    case "property":
      return scope.getProperty(ast.name);
    case "unary":
      return evalUnary(ast.op, evaluateExpression(ast.operand, scope));
    case "binary": {
      if (ast.op === "and" || ast.op === "or") {
        return evalLogical(ast.op, ast.left, ast.right, scope);
      }
      const left = evaluateExpression(ast.left, scope);
      if (isExprError(left)) {
        return left;
      }
      const right = evaluateExpression(ast.right, scope);
      if (isExprError(right)) {
        return right;
      }
      return applyBinary(ast.op, left, right);
    }
    case "call":
      return evalCall(ast.name, ast.args, scope);
    default:
      return exprError("Unsupported expression");
  }
}

/**
 * Whether an expression reads the clock (`now()`/`today()` anywhere in the
 * tree). Volatile expressions need scheduled re-evaluation ticks; they must
 * never become dependency-graph edges (see §5.3 of the databases proposal).
 */
export function isVolatileExpression(ast: ExprNode): boolean {
  switch (ast.kind) {
    case "literal":
    case "property":
      return false;
    case "unary":
      return isVolatileExpression(ast.operand);
    case "binary":
      return isVolatileExpression(ast.left) || isVolatileExpression(ast.right);
    case "call":
      return (
        VOLATILE_FUNCTION_NAMES.has(ast.name.toLowerCase()) ||
        ast.args.some(isVolatileExpression)
      );
    default:
      return false;
  }
}
