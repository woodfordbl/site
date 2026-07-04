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
import { endOfMonth } from "date-fns/endOfMonth";
import { endOfWeek } from "date-fns/endOfWeek";
import { endOfYear } from "date-fns/endOfYear";
import { format as dateFnsFormat } from "date-fns/format";
import { formatDistance } from "date-fns/formatDistance";
import { startOfMonth } from "date-fns/startOfMonth";
import { startOfWeek } from "date-fns/startOfWeek";
import { startOfYear } from "date-fns/startOfYear";
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

/** An ordered list value (multiSelect fields, `[…]` literals, list ops). */
export type ExprList = ExprPlainValue[];

/** A successfully computed expression value (no error). */
export type ExprPlainValue = number | string | boolean | null | ExprList;

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

/** Whether an expression result is a list value. */
export function isExprList(value: ExprValue): value is ExprList {
  return Array.isArray(value);
}

/**
 * Whether an expression result is an {@link ExprError}. Lists are objects too,
 * so they must be excluded — only the `{ type: "expr-error" }` shape is an
 * error.
 */
export function isExprError(value: ExprValue): value is ExprError {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (Array.isArray(value)) {
    return value.map(formatExprValueDefault).join(", ");
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
  if (Array.isArray(value)) {
    return "list";
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
  if (Array.isArray(value)) {
    return value.map(toText).join(", ");
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}

/**
 * Cell-emptiness predicate shared by `empty`/`isEmpty`/`isNotEmpty`: `null`
 * and blank/whitespace-only strings are empty; `0` and `false` are values.
 * Mirrors `isCellEmpty` in the databases layer.
 */
function isEmptyValue(value: ExprPlainValue): boolean {
  return (
    value === null || (typeof value === "string" && value.trim().length === 0)
  );
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
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) {
    // Defensive: an Invalid Date must never reach date-fns arithmetic or
    // `format` (which throws RangeError on it).
    return exprError(`${fnName}(): invalid date "${value}"`);
  }
  return parsed;
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

/**
 * Numeric aggregate operands: `sum`/`min`/`max`/`average` accept either
 * varargs (`sum(1, 2, 3)`) or a single list (`sum(thisPage.Scores)`) — a lone
 * list argument is spread to its elements.
 */
function numericOperands(args: ExprPlainValue[]): ExprPlainValue[] {
  return args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
}

function reduceNumbers(
  fnName: string,
  args: ExprPlainValue[],
  reduce: (a: number, b: number) => number
): ExprValue {
  let result: number | null = null;
  for (const arg of numericOperands(args)) {
    const n = requireNumber(arg, fnName);
    if (typeof n !== "number") {
      return n;
    }
    result = result === null ? n : reduce(result, n);
  }
  return result;
}

/**
 * `average()` / `avg()`: arithmetic mean of the numeric operands (varargs or a
 * single list). Same coercion rules as `min`/`max` — every operand must
 * already be a number, and the first non-number aborts with its error.
 */
function evalAverage(fnName: string, args: ExprPlainValue[]): ExprValue {
  const operands = numericOperands(args);
  let total = 0;
  for (const arg of operands) {
    const n = requireNumber(arg, fnName);
    if (typeof n !== "number") {
      return n;
    }
    total += n;
  }
  return operands.length === 0
    ? exprError(`${fnName}() of an empty list`)
    : total / operands.length;
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
  if (Number.isNaN(shifted.getTime())) {
    // Amounts that push past the ECMAScript ±8.64e15 ms date range (or a
    // non-finite amount) yield an Invalid Date, which date-fns `format`
    // would throw RangeError on — surface an ExprError value instead.
    return exprError("dateAdd(): resulting date is out of range");
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

/**
 * Guard the result of a math function: a non-finite result (NaN from
 * `sqrt(-1)`, ±Infinity from `pow(0, -1)`) becomes an `ExprError` value so it
 * never leaks into display formatting or comparisons as a silent NaN.
 */
function finiteResult(fnName: string, value: number): ExprValue {
  if (!Number.isFinite(value)) {
    return exprError(`${fnName}(): result is not a finite number`);
  }
  return value;
}

/** `applyNumeric` with a {@link finiteResult} guard for functions that can overflow/NaN. */
function applyNumericChecked(
  fnName: string,
  value: ExprPlainValue,
  apply: (n: number) => number
): ExprValue {
  const n = requireNumber(value, fnName);
  return typeof n === "number" ? finiteResult(fnName, apply(n)) : n;
}

/** Resolve two arguments to numbers (first error wins), then combine them. */
function twoNumbers(
  fnName: string,
  args: ExprPlainValue[],
  combine: (a: number, b: number) => ExprValue
): ExprValue {
  const a = requireNumber(args[0], fnName);
  if (typeof a !== "number") {
    return a;
  }
  const b = requireNumber(args[1], fnName);
  if (typeof b !== "number") {
    return b;
  }
  return combine(a, b);
}

/** `mod(a, b)` — remainder, function form of `%` (errors on a zero divisor). */
function evalMod(args: ExprPlainValue[]): ExprValue {
  return twoNumbers("mod", args, (a, b) =>
    b === 0 ? exprError("Division by zero") : a % b
  );
}

/** `clamp(n, low, high)` — constrain `n` to `[low, high]`. */
function evalClamp(args: ExprPlainValue[]): ExprValue {
  const n = requireNumber(args[0], "clamp");
  if (typeof n !== "number") {
    return n;
  }
  const low = requireNumber(args[1], "clamp");
  if (typeof low !== "number") {
    return low;
  }
  const high = requireNumber(args[2], "clamp");
  if (typeof high !== "number") {
    return high;
  }
  if (low > high) {
    return exprError("clamp(): low bound is greater than high bound");
  }
  return Math.min(Math.max(n, low), high);
}

/** `log(n, base?)` — natural log, or log to `base` when supplied. */
function evalLog(args: ExprPlainValue[]): ExprValue {
  const n = requireNumber(args[0], "log");
  if (typeof n !== "number") {
    return n;
  }
  if (args.length === 1) {
    return finiteResult("log", Math.log(n));
  }
  const base = requireNumber(args[1], "log");
  if (typeof base !== "number") {
    return base;
  }
  return finiteResult("log", Math.log(n) / Math.log(base));
}

/** `roundUp`/`roundDown(number, digits?)` — directional rounding to `digits` decimals. */
function evalRoundDir(
  fnName: string,
  args: ExprPlainValue[],
  round: (n: number) => number
): ExprValue {
  const value = requireNumber(args[0], fnName);
  if (typeof value !== "number") {
    return value;
  }
  if (args.length === 1) {
    return round(value);
  }
  const digits = requireNumber(args[1], fnName);
  if (typeof digits !== "number") {
    return digits;
  }
  const factor = 10 ** Math.trunc(digits);
  return round(value * factor) / factor;
}

/** `roundToMultiple(number, multiple)` — nearest multiple of `multiple`. */
function evalRoundToMultiple(args: ExprPlainValue[]): ExprValue {
  return twoNumbers("roundToMultiple", args, (value, multiple) =>
    multiple === 0
      ? exprError("roundToMultiple(): multiple cannot be zero")
      : Math.round(value / multiple) * multiple
  );
}

/** `toNumber(value)` — coerce text/boolean to a number, erroring when it can't. */
function evalToNumber(value: ExprPlainValue): ExprValue {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return exprError("toNumber(): empty text");
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed)
      ? parsed
      : exprError(
          `toNumber(): cannot convert ${JSON.stringify(value)} to a number`
        );
  }
  return exprError("toNumber(): cannot convert empty to a number");
}

/**
 * Longest string a padding/repeat function will build, mirroring
 * {@link MAX_EXPRESSION_LENGTH}'s spirit — bounds `padStart`/`padEnd`/`repeat`
 * so a huge length argument can't allocate an unbounded string.
 */
const MAX_STRING_BUILD_LENGTH = 10_000;

/** `padStart`/`padEnd(text, length, pad?)` — pad to `length` with `pad` (default space). */
function evalPad(
  fnName: string,
  args: ExprPlainValue[],
  pad: (text: string, length: number, fill: string) => string
): ExprValue {
  const text = toText(args[0]);
  const length = requireNumber(args[1], fnName);
  if (typeof length !== "number") {
    return length;
  }
  const target = Math.trunc(length);
  if (target > MAX_STRING_BUILD_LENGTH) {
    return exprError(
      `${fnName}(): target length exceeds ${MAX_STRING_BUILD_LENGTH}`
    );
  }
  const fill = args.length > 2 ? toText(args[2]) : " ";
  return pad(text, target, fill === "" ? " " : fill);
}

/** `repeat(text, count)` — concatenate `count` copies of `text`. */
function evalRepeat(args: ExprPlainValue[]): ExprValue {
  const text = toText(args[0]);
  const count = requireNumber(args[1], "repeat");
  if (typeof count !== "number") {
    return count;
  }
  const times = Math.trunc(count);
  if (times < 0) {
    return exprError("repeat(): count cannot be negative");
  }
  if (times * text.length > MAX_STRING_BUILD_LENGTH) {
    return exprError(
      `repeat(): result exceeds ${MAX_STRING_BUILD_LENGTH} characters`
    );
  }
  return text.repeat(times);
}

/** `substring(text, start, end?)` — slice by 0-based indices (end exclusive). */
function evalSubstring(args: ExprPlainValue[]): ExprValue {
  const text = toText(args[0]);
  const start = requireNumber(args[1], "substring");
  if (typeof start !== "number") {
    return start;
  }
  if (args.length === 2) {
    return text.slice(Math.trunc(start));
  }
  const end = requireNumber(args[2], "substring");
  if (typeof end !== "number") {
    return end;
  }
  return text.slice(Math.trunc(start), Math.trunc(end));
}

/** Compile a user regex without throwing; a bad pattern becomes an `ExprError`. */
function safeRegExp(
  fnName: string,
  pattern: ExprPlainValue,
  flags?: string
): RegExp | ExprError {
  const source = requireString(pattern, fnName);
  if (typeof source !== "string") {
    return source;
  }
  try {
    return new RegExp(source, flags);
  } catch {
    return exprError(
      `${fnName}(): invalid regular expression ${JSON.stringify(source)}`
    );
  }
}

/** `regexMatch(text, pattern)` — true when `pattern` matches anywhere in `text`. */
function evalRegexMatch(args: ExprPlainValue[]): ExprValue {
  const regex = safeRegExp("regexMatch", args[1]);
  return regex instanceof RegExp ? regex.test(toText(args[0])) : regex;
}

/** `regexExtract(text, pattern)` — the first match (whole match), or "" if none. */
function evalRegexExtract(args: ExprPlainValue[]): ExprValue {
  const regex = safeRegExp("regexExtract", args[1]);
  if (regex instanceof RegExp === false) {
    return regex;
  }
  const match = toText(args[0]).match(regex);
  return match === null ? "" : match[0];
}

/** `regexReplace(text, pattern, replacement)` — replace every match (global). */
function evalRegexReplace(args: ExprPlainValue[]): ExprValue {
  const regex = safeRegExp("regexReplace", args[1], "g");
  if (regex instanceof RegExp === false) {
    return regex;
  }
  return toText(args[0]).replace(regex, toText(args[2]));
}

/** Read one date argument and project a part out of it (year, weekday, …). */
function evalDatePart(
  fnName: string,
  arg: ExprPlainValue,
  extract: (date: Date) => ExprPlainValue
): ExprValue {
  const date = parseDateArg(arg, fnName);
  return date instanceof Date ? extract(date) : date;
}

const START_OF_UNIT = new Map<string, (date: Date) => Date>([
  ["day", (date) => date],
  ["week", (date) => startOfWeek(date)],
  ["month", startOfMonth],
  ["year", startOfYear],
]);

const END_OF_UNIT = new Map<string, (date: Date) => Date>([
  ["day", (date) => date],
  ["week", (date) => endOfWeek(date)],
  ["month", endOfMonth],
  ["year", endOfYear],
]);

/** `startOf`/`endOf(date, unit)` — snap a date to the boundary of its period. */
function evalDateBoundary(
  fnName: string,
  args: ExprPlainValue[],
  table: Map<string, (date: Date) => Date>
): ExprValue {
  const date = parseDateArg(args[0], fnName);
  if (date instanceof Date === false) {
    return date;
  }
  const unit = requireString(args[1], fnName);
  if (typeof unit !== "string") {
    return unit;
  }
  const snap = table.get(unit.trim().toLowerCase());
  if (snap === undefined) {
    return exprError(
      `${fnName}(): unknown unit ${JSON.stringify(unit)} — use "day", "week", "month", or "year"`
    );
  }
  return dateFnsFormat(snap(date), ISO_DATE_PATTERN);
}

/** `isSameDay(a, b)` — true when two dates fall on the same calendar day. */
function evalIsSameDay(args: ExprPlainValue[]): ExprValue {
  const a = parseDateArg(args[0], "isSameDay");
  if (a instanceof Date === false) {
    return a;
  }
  const b = parseDateArg(args[1], "isSameDay");
  if (b instanceof Date === false) {
    return b;
  }
  return differenceInCalendarDays(a, b) === 0;
}

/** Coerce a value to a list, or name the function in the type error. */
function requireList(
  value: ExprPlainValue,
  fnName: string
): ExprList | ExprError {
  return Array.isArray(value)
    ? value
    : exprError(`${fnName}() expects a list, got ${typeName(value)}`);
}

/** Apply a list operation after checking the first argument is a list. */
function withList(
  fnName: string,
  args: ExprPlainValue[],
  apply: (list: ExprList) => ExprValue
): ExprValue {
  const list = requireList(args[0], fnName);
  return Array.isArray(list) ? apply(list) : list;
}

/** Ordering for `sort`: numeric when both are numbers, else by display text. */
function compareForSort(a: ExprPlainValue, b: ExprPlainValue): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return toText(a).localeCompare(toText(b));
}

/** `at(list, index)` — element at a 0-based (or negative) index, else empty. */
function evalListAt(args: ExprPlainValue[]): ExprValue {
  return withList("at", args, (list) => {
    const index = requireNumber(args[1], "at");
    if (typeof index !== "number") {
      return index;
    }
    return list.at(Math.trunc(index)) ?? null;
  });
}

/** `join(list, separator?)` — text of the elements joined by `separator`. */
function evalListJoin(args: ExprPlainValue[]): ExprValue {
  return withList("join", args, (list) => {
    const separator = args.length > 1 ? toText(args[1]) : ", ";
    return list.map(toText).join(separator);
  });
}

/** `unique(list)` — elements with duplicates removed (by value equality). */
function evalListUnique(list: ExprList): ExprList {
  const result: ExprList = [];
  for (const element of list) {
    if (!result.some((seen) => valuesEqual(seen, element))) {
      result.push(element);
    }
  }
  return result;
}

/** `slice(list, start, end?)` — sublist by 0-based indices (end exclusive). */
function evalListSlice(args: ExprPlainValue[]): ExprValue {
  return withList("slice", args, (list) => {
    const start = requireNumber(args[1], "slice");
    if (typeof start !== "number") {
      return start;
    }
    if (args.length === 2) {
      return list.slice(Math.trunc(start));
    }
    const end = requireNumber(args[2], "slice");
    if (typeof end !== "number") {
      return end;
    }
    return list.slice(Math.trunc(start), Math.trunc(end));
  });
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
  [
    "sum",
    {
      minArgs: 1,
      maxArgs: Number.POSITIVE_INFINITY,
      apply: (args) => reduceNumbers("sum", args, (a, b) => a + b),
    },
  ],
  [
    "average",
    {
      minArgs: 1,
      maxArgs: Number.POSITIVE_INFINITY,
      apply: (args) => evalAverage("average", args),
    },
  ],
  [
    // Alias for `average` (kept as its own entry so errors name "avg()").
    "avg",
    {
      minArgs: 1,
      maxArgs: Number.POSITIVE_INFINITY,
      apply: (args) => evalAverage("avg", args),
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
      apply: (args) => isEmptyValue(args[0]),
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
  // Logic — type guards and boolean helpers (all eager; `if`/`switch`/`ifs`
  // that need lazy branches live in evalCall, not here).
  [
    "isempty",
    { minArgs: 1, maxArgs: 1, apply: (args) => isEmptyValue(args[0]) },
  ],
  [
    "isnotempty",
    { minArgs: 1, maxArgs: 1, apply: (args) => !isEmptyValue(args[0]) },
  ],
  [
    "isnumber",
    { minArgs: 1, maxArgs: 1, apply: (args) => typeof args[0] === "number" },
  ],
  [
    "istext",
    { minArgs: 1, maxArgs: 1, apply: (args) => typeof args[0] === "string" },
  ],
  [
    "isboolean",
    { minArgs: 1, maxArgs: 1, apply: (args) => typeof args[0] === "boolean" },
  ],
  [
    "isdate",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) =>
        typeof args[0] === "string" && toIsoDatePart(args[0]) !== "",
    },
  ],
  [
    "xor",
    {
      minArgs: 2,
      maxArgs: 2,
      apply: (args) => {
        const a = requireBoolean(args[0], "xor");
        if (typeof a !== "boolean") {
          return a;
        }
        const b = requireBoolean(args[1], "xor");
        return typeof b === "boolean" ? a !== b : b;
      },
    },
  ],
  // Math
  ["mod", { minArgs: 2, maxArgs: 2, apply: (args) => evalMod(args) }],
  [
    "pow",
    {
      minArgs: 2,
      maxArgs: 2,
      apply: (args) =>
        twoNumbers("pow", args, (a, b) => finiteResult("pow", a ** b)),
    },
  ],
  [
    "sqrt",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => applyNumericChecked("sqrt", args[0], Math.sqrt),
    },
  ],
  ["clamp", { minArgs: 3, maxArgs: 3, apply: (args) => evalClamp(args) }],
  [
    "sign",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => applyNumeric("sign", args[0], Math.sign),
    },
  ],
  ["log", { minArgs: 1, maxArgs: 2, apply: (args) => evalLog(args) }],
  [
    "log10",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => applyNumericChecked("log10", args[0], Math.log10),
    },
  ],
  [
    "exp",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => applyNumericChecked("exp", args[0], Math.exp),
    },
  ],
  [
    "roundup",
    {
      minArgs: 1,
      maxArgs: 2,
      apply: (args) => evalRoundDir("roundUp", args, Math.ceil),
    },
  ],
  [
    "rounddown",
    {
      minArgs: 1,
      maxArgs: 2,
      apply: (args) => evalRoundDir("roundDown", args, Math.floor),
    },
  ],
  [
    "roundtomultiple",
    { minArgs: 2, maxArgs: 2, apply: (args) => evalRoundToMultiple(args) },
  ],
  [
    "tonumber",
    { minArgs: 1, maxArgs: 1, apply: (args) => evalToNumber(args[0]) },
  ],
  // Text
  [
    "substring",
    { minArgs: 2, maxArgs: 3, apply: (args) => evalSubstring(args) },
  ],
  [
    "startswith",
    {
      minArgs: 2,
      maxArgs: 2,
      apply: (args) => toText(args[0]).startsWith(toText(args[1])),
    },
  ],
  [
    "endswith",
    {
      minArgs: 2,
      maxArgs: 2,
      apply: (args) => toText(args[0]).endsWith(toText(args[1])),
    },
  ],
  [
    "indexof",
    {
      // 0-based index of the first occurrence, or -1 when not found.
      minArgs: 2,
      maxArgs: 2,
      apply: (args) => toText(args[0]).indexOf(toText(args[1])),
    },
  ],
  [
    "padstart",
    {
      minArgs: 2,
      maxArgs: 3,
      apply: (args) => evalPad("padStart", args, (t, n, f) => t.padStart(n, f)),
    },
  ],
  [
    "padend",
    {
      minArgs: 2,
      maxArgs: 3,
      apply: (args) => evalPad("padEnd", args, (t, n, f) => t.padEnd(n, f)),
    },
  ],
  ["repeat", { minArgs: 2, maxArgs: 2, apply: (args) => evalRepeat(args) }],
  [
    "capitalize",
    {
      // Uppercase the first character, leave the rest untouched.
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => {
        const text = toText(args[0]);
        return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
      },
    },
  ],
  [
    "regexmatch",
    { minArgs: 2, maxArgs: 2, apply: (args) => evalRegexMatch(args) },
  ],
  [
    "regexextract",
    { minArgs: 2, maxArgs: 2, apply: (args) => evalRegexExtract(args) },
  ],
  [
    "regexreplace",
    { minArgs: 3, maxArgs: 3, apply: (args) => evalRegexReplace(args) },
  ],
  // Date parts
  [
    "year",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => evalDatePart("year", args[0], (d) => d.getFullYear()),
    },
  ],
  [
    "month",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => evalDatePart("month", args[0], (d) => d.getMonth() + 1),
    },
  ],
  [
    "day",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => evalDatePart("day", args[0], (d) => d.getDate()),
    },
  ],
  [
    "weekday",
    {
      // 0 = Sunday … 6 = Saturday (JS `getDay` convention).
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => evalDatePart("weekday", args[0], (d) => d.getDay()),
    },
  ],
  [
    "dayname",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) =>
        evalDatePart("dayName", args[0], (d) => dateFnsFormat(d, "EEEE")),
    },
  ],
  [
    "monthname",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) =>
        evalDatePart("monthName", args[0], (d) => dateFnsFormat(d, "MMMM")),
    },
  ],
  [
    "startof",
    {
      minArgs: 2,
      maxArgs: 2,
      apply: (args) => evalDateBoundary("startOf", args, START_OF_UNIT),
    },
  ],
  [
    "endof",
    {
      minArgs: 2,
      maxArgs: 2,
      apply: (args) => evalDateBoundary("endOf", args, END_OF_UNIT),
    },
  ],
  [
    "issameday",
    { minArgs: 2, maxArgs: 2, apply: (args) => evalIsSameDay(args) },
  ],
  // List operations (eager). The higher-order ones (map/filter/…) that take a
  // lambda live in LAZY_CALLS so `current` binds per element.
  [
    "count",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => withList("count", args, (l) => l.length),
    },
  ],
  [
    "length",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => withList("length", args, (l) => l.length),
    },
  ],
  [
    "first",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => withList("first", args, (l) => l[0] ?? null),
    },
  ],
  [
    "last",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => withList("last", args, (l) => l.at(-1) ?? null),
    },
  ],
  ["at", { minArgs: 2, maxArgs: 2, apply: (args) => evalListAt(args) }],
  [
    "includes",
    {
      minArgs: 2,
      maxArgs: 2,
      apply: (args) =>
        withList("includes", args, (l) =>
          l.some((element) => valuesEqual(element, args[1]))
        ),
    },
  ],
  ["join", { minArgs: 1, maxArgs: 2, apply: (args) => evalListJoin(args) }],
  [
    "unique",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => withList("unique", args, evalListUnique),
    },
  ],
  [
    "reverse",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) => withList("reverse", args, (l) => [...l].reverse()),
    },
  ],
  ["slice", { minArgs: 2, maxArgs: 3, apply: (args) => evalListSlice(args) }],
  [
    "sort",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args) =>
        withList("sort", args, (l) => [...l].sort(compareForSort)),
    },
  ],
  // Formatting (value → display text) and type conversion — unified as plain
  // functions (there is no separate pipe syntax).
  ["currency", { minArgs: 1, maxArgs: 2, apply: (args) => evalCurrency(args) }],
  ["percent", { minArgs: 1, maxArgs: 2, apply: (args) => evalPercent(args) }],
  ["compact", { minArgs: 1, maxArgs: 1, apply: (args) => evalCompact(args) }],
  [
    "formatnumber",
    { minArgs: 1, maxArgs: 2, apply: (args) => evalFormatNumber(args) },
  ],
  [
    "fromnow",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args, scope) => evalFromNow(args, scope),
    },
  ],
  [
    // Alias for fromNow (kept as its own entry so errors name "timeAgo()").
    "timeago",
    {
      minArgs: 1,
      maxArgs: 1,
      apply: (args, scope) => evalFromNow(args, scope),
    },
  ],
  ["totext", { minArgs: 1, maxArgs: 1, apply: (args) => toText(args[0]) }],
  ["todate", { minArgs: 1, maxArgs: 1, apply: (args) => evalToDate(args) }],
  [
    "toboolean",
    { minArgs: 1, maxArgs: 1, apply: (args) => evalToBoolean(args[0]) },
  ],
]);

/** Optional integer argument (decimal places) for the numeric formatters. */
function optionalDigits(
  fnName: string,
  args: ExprPlainValue[]
): number | null | ExprError {
  if (args.length < 2) {
    return null;
  }
  const digits = requireNumber(args[1], fnName);
  return typeof digits === "number" ? Math.trunc(digits) : digits;
}

/** `currency(value, code?)` — format a number as currency text (default USD). */
function evalCurrency(args: ExprPlainValue[]): ExprValue {
  const n = requireNumber(args[0], "currency");
  if (typeof n !== "number") {
    return n;
  }
  const code = args.length > 1 ? toText(args[1]) : "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(n);
  } catch {
    return exprError(
      `currency(): unknown currency code ${JSON.stringify(code)}`
    );
  }
}

/** `percent(value, decimals?)` — format a fraction as a percentage (0.42 → 42%). */
function evalPercent(args: ExprPlainValue[]): ExprValue {
  const n = requireNumber(args[0], "percent");
  if (typeof n !== "number") {
    return n;
  }
  const digits = optionalDigits("percent", args);
  if (typeof digits !== "number" && digits !== null) {
    return digits;
  }
  const places = digits ?? 0;
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(n);
}

/** `compact(value)` — abbreviate a large number (12400 → 12.4K). */
function evalCompact(args: ExprPlainValue[]): ExprValue {
  const n = requireNumber(args[0], "compact");
  return typeof n === "number"
    ? new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n)
    : n;
}

/** `formatNumber(value, decimals?)` — grouped number text with optional fixed decimals. */
function evalFormatNumber(args: ExprPlainValue[]): ExprValue {
  const n = requireNumber(args[0], "formatNumber");
  if (typeof n !== "number") {
    return n;
  }
  const digits = optionalDigits("formatNumber", args);
  if (typeof digits !== "number" && digits !== null) {
    return digits;
  }
  const options: Intl.NumberFormatOptions =
    digits === null
      ? { maximumFractionDigits: 6 }
      : { minimumFractionDigits: digits, maximumFractionDigits: digits };
  return new Intl.NumberFormat("en-US", options).format(n);
}

/** `fromNow(date)` / `timeAgo(date)` — clock-relative distance ("3 days ago"). */
function evalFromNow(args: ExprPlainValue[], scope: ExprScope): ExprValue {
  const date = parseDateArg(args[0], "fromNow");
  if (date instanceof Date === false) {
    return date;
  }
  return formatDistance(date, scopeNow(scope), { addSuffix: true });
}

/** `toDate(value)` — parse a value into an ISO date string (yyyy-mm-dd). */
function evalToDate(args: ExprPlainValue[]): ExprValue {
  const date = parseDateArg(args[0], "toDate");
  return date instanceof Date ? dateFnsFormat(date, ISO_DATE_PATTERN) : date;
}

/** `toBoolean(value)` — coerce a value to true/false with common text rules. */
function evalToBoolean(value: ExprPlainValue): ExprValue {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (value === null) {
    return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") {
      return true;
    }
    if (
      normalized === "false" ||
      normalized === "no" ||
      normalized === "0" ||
      normalized === ""
    ) {
      return false;
    }
    return exprError(`toBoolean(): cannot convert ${JSON.stringify(value)}`);
  }
  return exprError("toBoolean(): cannot convert a list to a boolean");
}

/**
 * Every implemented function name (lowercased), lazily-evaluated `if`
 * included. The drift anchor for the UI catalog in `function-catalog.ts` —
 * its test asserts catalog coverage against this list so adding a function
 * here without documenting it (or vice versa) fails loudly.
 */
export function implementedExprFunctionNames(): string[] {
  // Lazy special forms (control flow + higher-order list ops) live outside
  // EXPR_FUNCTIONS.
  return [
    "if",
    "ifs",
    "switch",
    "let",
    "lets",
    "map",
    "filter",
    "find",
    "some",
    "every",
    "countif",
    ...EXPR_FUNCTIONS.keys(),
  ];
}

/** Function names whose results depend on the clock (see {@link isVolatileExpression}). */
const VOLATILE_FUNCTION_NAMES = new Set(["now", "today", "fromnow", "timeago"]);

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
  if (Array.isArray(left) || Array.isArray(right)) {
    // Lists are equal element-by-element; a list never equals a scalar.
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((element, index) => valuesEqual(element, right[index]))
    );
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

/**
 * A `let`/`lets`/`current` binding frame — an immutable linked list walked
 * inner-to-outer by {@link lookupBinding}. Names are stored lowercased so
 * lookup is case-insensitive, matching property and function resolution.
 */
interface BindingFrame {
  readonly name: string;
  readonly parent: BindingFrame | null;
  readonly value: ExprValue;
}

/** Empty binding scope (the top-level, non-lambda, non-`let` case). */
type Bindings = BindingFrame | null;

/** Resolve a variable against the binding chain, or report it unbound. */
function lookupBinding(bindings: Bindings, name: string): ExprValue {
  const key = name.toLowerCase();
  for (let frame = bindings; frame !== null; frame = frame.parent) {
    if (frame.name === key) {
      return frame.value;
    }
  }
  return exprError(
    `Unknown identifier "${name}" — expected thisPage.<property>, a function call, or a literal`
  );
}

function evalLogical(
  op: "and" | "or",
  leftNode: ExprNode,
  rightNode: ExprNode,
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  const left = requireBoolean(evalNode(leftNode, scope, bindings), op);
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
  return requireBoolean(evalNode(rightNode, scope, bindings), op);
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

function evalIf(
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  if (args.length !== 3) {
    return exprError(`if() expects 3 arguments, got ${args.length}`);
  }
  const condition = requireBoolean(evalNode(args[0], scope, bindings), "if");
  if (typeof condition !== "boolean") {
    return condition;
  }
  // Lazy: only the taken branch evaluates, so `if(x != 0, 1 / x, 0)` is safe.
  return evalNode(condition ? args[1] : args[2], scope, bindings);
}

/**
 * `switch(subject, case1, result1, …, default?)` — compares `subject` to each
 * case with type-aware equality and returns the matching result. A trailing
 * odd argument is the default; with none and no match the result is empty.
 * Lazy: only the subject, the compared cases, and the taken result evaluate.
 */
function evalSwitch(
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  if (args.length < 3) {
    return exprError(
      `switch() expects at least 3 arguments, got ${args.length}`
    );
  }
  const subject = evalNode(args[0], scope, bindings);
  if (isExprError(subject)) {
    return subject;
  }
  let index = 1;
  while (index + 1 < args.length) {
    const caseValue = evalNode(args[index], scope, bindings);
    if (isExprError(caseValue)) {
      return caseValue;
    }
    if (valuesEqual(subject, caseValue)) {
      return evalNode(args[index + 1], scope, bindings);
    }
    index += 2;
  }
  return index < args.length ? evalNode(args[index], scope, bindings) : null;
}

/**
 * `ifs(cond1, result1, …, default?)` — returns the first result whose
 * condition is true. A trailing odd argument is the default; with none and no
 * match, an error. Lazy: evaluation stops at the first true condition.
 */
function evalIfs(
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  if (args.length < 2) {
    return exprError(`ifs() expects at least 2 arguments, got ${args.length}`);
  }
  let index = 0;
  while (index + 1 < args.length) {
    const condition = requireBoolean(
      evalNode(args[index], scope, bindings),
      "ifs"
    );
    if (typeof condition !== "boolean") {
      return condition;
    }
    if (condition) {
      return evalNode(args[index + 1], scope, bindings);
    }
    index += 2;
  }
  return index < args.length
    ? evalNode(args[index], scope, bindings)
    : exprError("ifs(): no condition matched");
}

/** `let(name, value, body)` — bind `name` to `value`, then evaluate `body`. */
function evalLet(
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  if (args.length !== 3) {
    return exprError(`let() expects 3 arguments, got ${args.length}`);
  }
  const nameNode = args[0];
  if (nameNode.kind !== "variable") {
    return exprError("let(): the first argument must be a binding name");
  }
  const value = evalNode(args[1], scope, bindings);
  const extended: BindingFrame = {
    name: nameNode.name.toLowerCase(),
    value,
    parent: bindings,
  };
  return evalNode(args[2], scope, extended);
}

/**
 * `lets(name1, value1, …, body)` — multiple bindings then a body. Each value
 * sees the bindings before it (Excel `LET` semantics), so later bindings can
 * build on earlier ones.
 */
function evalLets(
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  if (args.length < 3 || args.length % 2 === 0) {
    return exprError(
      `lets() expects an odd number of arguments (name/value pairs then a body), got ${args.length}`
    );
  }
  let frame = bindings;
  for (let index = 0; index + 1 < args.length - 1; index += 2) {
    const nameNode = args[index];
    if (nameNode.kind !== "variable") {
      return exprError("lets(): binding names must be identifiers");
    }
    frame = {
      name: nameNode.name.toLowerCase(),
      value: evalNode(args[index + 1], scope, frame),
      parent: frame,
    };
  }
  const body = args.at(-1);
  // The arity guard above ensures a body arg exists; this keeps types honest.
  return body === undefined
    ? exprError("lets(): missing body")
    : evalNode(body, scope, frame);
}

/**
 * Evaluate the list argument of a higher-order call (`map`/`filter`/…),
 * checking arity and that the first argument is a list.
 */
function higherOrderList(
  fnName: string,
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprList | ExprError {
  if (args.length !== 2) {
    return exprError(`${fnName}() expects 2 arguments, got ${args.length}`);
  }
  const value = evalNode(args[0], scope, bindings);
  if (isExprError(value)) {
    return value;
  }
  return requireList(value, fnName);
}

/** Child binding frame exposing `current` (element) and `index` to a lambda. */
function lambdaFrame(
  bindings: Bindings,
  element: ExprPlainValue,
  index: number
): BindingFrame {
  return {
    name: "current",
    value: element,
    parent: { name: "index", value: index, parent: bindings },
  };
}

/**
 * Evaluate a boolean predicate lambda over every element (binding `current`),
 * returning the per-element results or the first error / non-boolean.
 */
function predicateResults(
  fnName: string,
  list: ExprList,
  lambda: ExprNode,
  scope: ExprScope,
  bindings: Bindings
): boolean[] | ExprError {
  const results: boolean[] = [];
  for (const [index, element] of list.entries()) {
    const value = requireBoolean(
      evalNode(lambda, scope, lambdaFrame(bindings, element, index)),
      fnName
    );
    if (typeof value !== "boolean") {
      return value;
    }
    results.push(value);
  }
  return results;
}

/** `map(list, expr)` — apply `expr` (with `current` bound) to each element. */
function evalMap(
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  const list = higherOrderList("map", args, scope, bindings);
  if (isExprError(list)) {
    return list;
  }
  const mapped: ExprList = [];
  for (const [index, element] of list.entries()) {
    const value = evalNode(
      args[1],
      scope,
      lambdaFrame(bindings, element, index)
    );
    if (isExprError(value)) {
      return value;
    }
    mapped.push(value);
  }
  return mapped;
}

/** `filter(list, predicate)` — keep the elements whose predicate is true. */
function evalFilter(
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  const list = higherOrderList("filter", args, scope, bindings);
  if (isExprError(list)) {
    return list;
  }
  const results = predicateResults("filter", list, args[1], scope, bindings);
  return Array.isArray(results)
    ? list.filter((_, index) => results[index])
    : results;
}

/** `find(list, predicate)` — the first element whose predicate is true, else empty. */
function evalFind(
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  const list = higherOrderList("find", args, scope, bindings);
  if (isExprError(list)) {
    return list;
  }
  const results = predicateResults("find", list, args[1], scope, bindings);
  if (isExprError(results)) {
    return results;
  }
  const at = results.indexOf(true);
  return at === -1 ? null : list[at];
}

/** `some(list, predicate)` / `every(list, predicate)` — boolean quantifiers. */
function evalQuantifier(
  fnName: "some" | "every",
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  const list = higherOrderList(fnName, args, scope, bindings);
  if (isExprError(list)) {
    return list;
  }
  const results = predicateResults(fnName, list, args[1], scope, bindings);
  if (isExprError(results)) {
    return results;
  }
  return fnName === "some" ? results.includes(true) : !results.includes(false);
}

/** `countIf(list, predicate)` — number of elements whose predicate is true. */
function evalCountIf(
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  const list = higherOrderList("countIf", args, scope, bindings);
  if (isExprError(list)) {
    return list;
  }
  const results = predicateResults("countIf", list, args[1], scope, bindings);
  return Array.isArray(results) ? results.filter(Boolean).length : results;
}

/** Lazy special forms whose arguments must not be eagerly evaluated. */
const LAZY_CALLS = new Map<
  string,
  (args: ExprNode[], scope: ExprScope, bindings: Bindings) => ExprValue
>([
  ["if", evalIf],
  ["ifs", evalIfs],
  ["switch", evalSwitch],
  ["let", evalLet],
  ["lets", evalLets],
  ["map", evalMap],
  ["filter", evalFilter],
  ["find", evalFind],
  [
    "some",
    (args, scope, bindings) => evalQuantifier("some", args, scope, bindings),
  ],
  [
    "every",
    (args, scope, bindings) => evalQuantifier("every", args, scope, bindings),
  ],
  ["countif", evalCountIf],
]);

function evalCall(
  name: string,
  args: ExprNode[],
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  const lower = name.toLowerCase();
  const lazy = LAZY_CALLS.get(lower);
  if (lazy !== undefined) {
    return lazy(args, scope, bindings);
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
    const value = evalNode(arg, scope, bindings);
    if (isExprError(value)) {
      return value;
    }
    values.push(value);
  }
  return def.apply(values, scope);
}

/** Recursive core of {@link evaluateExpression}, threading the binding scope. */
function evalNode(
  ast: ExprNode,
  scope: ExprScope,
  bindings: Bindings
): ExprValue {
  switch (ast.kind) {
    case "literal":
      return ast.value;
    case "property":
      return scope.getProperty(ast.name);
    case "variable":
      return lookupBinding(bindings, ast.name);
    case "list": {
      const elements: ExprList = [];
      for (const element of ast.elements) {
        const value = evalNode(element, scope, bindings);
        if (isExprError(value)) {
          return value;
        }
        elements.push(value);
      }
      return elements;
    }
    case "unary":
      return evalUnary(ast.op, evalNode(ast.operand, scope, bindings));
    case "binary": {
      if (ast.op === "and" || ast.op === "or") {
        return evalLogical(ast.op, ast.left, ast.right, scope, bindings);
      }
      const left = evalNode(ast.left, scope, bindings);
      if (isExprError(left)) {
        return left;
      }
      const right = evalNode(ast.right, scope, bindings);
      if (isExprError(right)) {
        return right;
      }
      return applyBinary(ast.op, left, right);
    }
    case "call":
      return evalCall(ast.name, ast.args, scope, bindings);
    default:
      return exprError("Unsupported expression");
  }
}

/**
 * Evaluate a parsed expression against a scope. Never throws — all failure
 * modes surface as {@link ExprError} values, and any error operand propagates
 * outward (except through the untaken branches of `and`/`or`/`if`/`switch`/
 * `ifs`, which short-circuit).
 */
export function evaluateExpression(ast: ExprNode, scope: ExprScope): ExprValue {
  return evalNode(ast, scope, null);
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
    case "variable":
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
    case "list":
      return ast.elements.some(isVolatileExpression);
    default:
      return false;
  }
}
