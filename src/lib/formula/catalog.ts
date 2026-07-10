/**
 * Typed function catalog for the v2 formula language (`lib/formula`) — the
 * single source of truth for the stdlib. Each entry carries the typed
 * signature (params/returns, driving the future checker and the docs UI),
 * the human docs (description + runnable examples), and the implementation
 * (`apply`), so the evaluator dispatches straight off this table and nothing
 * can drift. Arity and top-level argument-type errors are generated
 * generically from the signature by the evaluator; `lenient` params opt out
 * of the generic gate and validate/coerce inside the implementation (v1
 * text-coercion behaviors are preserved that way).
 *
 * `let`, `lets`, and `prop(...)` are NOT catalog entries: `prop` is syntax
 * (parses to a property node) and `let`/`lets` are binding forms that need
 * raw AST access, so they live in the evaluator as special forms.
 */

import { addDays } from "date-fns/addDays";
import { addHours } from "date-fns/addHours";
import { addMinutes } from "date-fns/addMinutes";
import { addMonths } from "date-fns/addMonths";
import { addYears } from "date-fns/addYears";
import { differenceInCalendarDays } from "date-fns/differenceInCalendarDays";
import { differenceInCalendarMonths } from "date-fns/differenceInCalendarMonths";
import { differenceInCalendarYears } from "date-fns/differenceInCalendarYears";
import { differenceInHours } from "date-fns/differenceInHours";
import { differenceInMinutes } from "date-fns/differenceInMinutes";
import { format as dateFnsFormat } from "date-fns/format";
import {
  formulaValueToDisplay,
  formulaValueToText,
} from "@/lib/formula/display.ts";
import {
  BLANK_TYPE,
  BOOLEAN_TYPE,
  DATE_TYPE,
  type FormulaType,
  lambdaTypeOf,
  listTypeOf,
  NUMBER_TYPE,
  TEXT_TYPE,
  TYPE_VARIABLE_T,
  TYPE_VARIABLE_U,
  UNKNOWN_TYPE,
  unionTypeOf,
} from "@/lib/formula/types.ts";
import {
  FormulaDate,
  FormulaError,
  type FormulaScope,
  type FormulaValue,
  formulaError,
  formulaScopeNow,
  formulaValuesEqual,
  formulaValueTypeName,
  isFormulaError,
  requireBooleanValue,
  requireNumberValue,
} from "@/lib/formula/values.ts";

/** Section a function is listed under in the docs UI. */
export type FormulaFunctionCategory =
  | "logic"
  | "math"
  | "text"
  | "list"
  | "date"
  | "time"
  | "display";

/** One typed parameter of a catalog signature. */
export interface FormulaParamSpec {
  /** Evaluator passes a thunk instead of a value (short-circuit args). */
  readonly lazy?: boolean;
  /**
   * Skip the generic runtime type gate for this argument; the
   * implementation coerces or validates it itself (v1-compatible coercion,
   * or a compound shape like "one list OR variadic scalars").
   */
  readonly lenient?: boolean;
  readonly name: string;
  /** May accept remaining arguments (must be the last parameter). */
  readonly optional?: boolean;
  readonly type: FormulaType;
  readonly variadic?: boolean;
}

/** A deferred argument for lazily-evaluated functions. */
export type FormulaThunk = () => FormulaValue;

/**
 * Evaluator services handed to implementations. `name` is the invoked
 * spelling in its documented casing (alias-aware) for error messages;
 * `callLambda` applies a lambda value under the evaluator's recursion
 * guard.
 */
export interface FormulaCallContext {
  callLambda(fn: FormulaValue, args: readonly FormulaValue[]): FormulaValue;
  readonly name: string;
  readonly scope: FormulaScope;
}

interface FormulaFunctionMeta {
  readonly aliases?: readonly string[];
  readonly category: FormulaFunctionCategory;
  /** One sentence, sentence case. */
  readonly description: string;
  /** Runnable expressions; tests assert each parses AND evaluates cleanly. */
  readonly examples: readonly string[];
  /** Canonical name, in the casing the docs use. */
  readonly name: string;
  readonly params: readonly FormulaParamSpec[];
  readonly returns: FormulaType;
  /** Result depends on the clock (`now`/`today`). */
  readonly volatile?: boolean;
}

/**
 * One catalog entry. `kind: "eager"` receives evaluated values (errors
 * already propagated, generic type gate already applied to non-lenient
 * params); `kind: "lazy"` receives one memoized thunk per argument and
 * decides itself what to evaluate.
 */
export type FormulaFunctionEntry = FormulaFunctionMeta &
  (
    | {
        readonly kind: "eager";
        apply(
          args: readonly FormulaValue[],
          context: FormulaCallContext
        ): FormulaValue;
      }
    | {
        readonly kind: "lazy";
        apply(
          args: readonly FormulaThunk[],
          context: FormulaCallContext
        ): FormulaValue;
      }
  );

/** Minimum accepted argument count, derived from the signature. */
export function formulaMinArgs(entry: FormulaFunctionEntry): number {
  let min = 0;
  for (const param of entry.params) {
    if (!param.optional) {
      min += 1;
    }
  }
  return min;
}

/** Maximum accepted argument count, derived from the signature. */
export function formulaMaxArgs(entry: FormulaFunctionEntry): number {
  const last = entry.params.at(-1);
  return last?.variadic ? Number.POSITIVE_INFINITY : entry.params.length;
}

/** v1-shaped arity error message, using the call name as written. */
export function formulaArityMessage(
  name: string,
  entry: FormulaFunctionEntry,
  got: number
): string {
  const min = formulaMinArgs(entry);
  const max = formulaMaxArgs(entry);
  if (min === max) {
    const plural = min === 1 ? "argument" : "arguments";
    return `${name}() expects ${min} ${plural}, got ${got}`;
  }
  if (max === Number.POSITIVE_INFINITY) {
    return `${name}() expects at least ${min} argument(s), got ${got}`;
  }
  return `${name}() expects ${min} to ${max} arguments, got ${got}`;
}

/**
 * The documented casing for an invoked spelling: the matching alias when the
 * call came through one, else the canonical name. Keeps error messages
 * reading `avg() expects…` and `formatDate() expects…` exactly like v1.
 */
export function formulaFunctionMessageName(
  entry: FormulaFunctionEntry,
  lowerInvoked: string
): string {
  if (entry.name.toLowerCase() === lowerInvoked) {
    return entry.name;
  }
  const alias = entry.aliases?.find(
    (candidate) => candidate.toLowerCase() === lowerInvoked
  );
  return alias ?? entry.name;
}

// --- shared implementation helpers -----------------------------------------

const LIST_OF_T = listTypeOf(TYPE_VARIABLE_T);
/**
 * Lambda-typed params double as the checker's supply contract: the declared
 * parameter count is exactly how many arguments the implementation passes to
 * `callLambda`, so a lambda naming more parameters than that is a static
 * error. Predicates and map transforms receive `(item, index)`; the sort key
 * receives `(item)` only.
 */
const PREDICATE_TYPE = lambdaTypeOf(
  [TYPE_VARIABLE_T, NUMBER_TYPE],
  BOOLEAN_TYPE
);
const TRANSFORM_TYPE = lambdaTypeOf(
  [TYPE_VARIABLE_T, NUMBER_TYPE],
  TYPE_VARIABLE_U
);
/** Sort key: result type is free (U); orderability is enforced at runtime. */
const SORT_KEY_TYPE = lambdaTypeOf([TYPE_VARIABLE_T], TYPE_VARIABLE_U);
const NUMBERS_OR_LIST = unionTypeOf(NUMBER_TYPE, listTypeOf(NUMBER_TYPE));

/** Coerce every argument to text, propagating the first coercion error. */
function textFragments(args: readonly FormulaValue[]): string[] | FormulaError {
  const fragments: string[] = [];
  for (const arg of args) {
    const text = formulaValueToText(arg);
    if (typeof text !== "string") {
      return text;
    }
    fragments.push(text);
  }
  return fragments;
}

/** Apply a text function to a single coerced argument. */
function applyText(
  value: FormulaValue,
  apply: (text: string) => FormulaValue
): FormulaValue {
  const text = formulaValueToText(value);
  return typeof text === "string" ? apply(text) : text;
}

/** Apply a text function to two coerced arguments. */
function applyText2(
  a: FormulaValue,
  b: FormulaValue,
  apply: (a: string, b: string) => FormulaValue
): FormulaValue {
  const textA = formulaValueToText(a);
  if (typeof textA !== "string") {
    return textA;
  }
  const textB = formulaValueToText(b);
  if (typeof textB !== "string") {
    return textB;
  }
  return apply(textA, textB);
}

interface AggregateNumbers {
  fromList: boolean;
  numbers: number[];
}

/**
 * Shared argument handling for `min`/`max`/`sum`/`average`: EITHER one list
 * (blank elements skipped, error elements propagate, non-numbers rejected)
 * OR variadic scalars with v1's strict rules (every argument must be a
 * number — blanks included, matching v1 messages).
 */
function collectAggregateNumbers(
  name: string,
  args: readonly FormulaValue[]
): AggregateNumbers | FormulaError {
  const first = args[0];
  if (args.length === 1 && Array.isArray(first)) {
    const numbers: number[] = [];
    for (const item of first) {
      if (item === null) {
        continue;
      }
      const n = requireNumberValue(item, name);
      if (typeof n !== "number") {
        return n;
      }
      numbers.push(n);
    }
    return { fromList: true, numbers };
  }
  const numbers: number[] = [];
  for (const arg of args) {
    const n = requireNumberValue(arg, name);
    if (typeof n !== "number") {
      return n;
    }
    numbers.push(n);
  }
  return { fromList: false, numbers };
}

function evalMinMax(
  name: string,
  args: readonly FormulaValue[],
  reduce: (a: number, b: number) => number
): FormulaValue {
  const collected = collectAggregateNumbers(name, args);
  if (collected instanceof FormulaError) {
    return collected;
  }
  if (collected.numbers.length === 0) {
    // Empty or all-blank list — no extreme exists; blank, not an error.
    return null;
  }
  // Binary callback: Math.min/max would misread reduce's extra arguments.
  return collected.numbers.reduce((a, b) => reduce(a, b));
}

function evalSum(name: string, args: readonly FormulaValue[]): FormulaValue {
  const collected = collectAggregateNumbers(name, args);
  if (collected instanceof FormulaError) {
    return collected;
  }
  let total = 0;
  for (const n of collected.numbers) {
    total += n;
  }
  return total;
}

function evalAverage(
  name: string,
  args: readonly FormulaValue[]
): FormulaValue {
  const collected = collectAggregateNumbers(name, args);
  if (collected instanceof FormulaError) {
    return collected;
  }
  if (collected.numbers.length === 0) {
    return formulaError(`${name}(): cannot average an empty list`);
  }
  let total = 0;
  for (const n of collected.numbers) {
    total += n;
  }
  return total / collected.numbers.length;
}

function evalRound(args: readonly FormulaValue[]): FormulaValue {
  const value = args[0] as number;
  if (args.length === 1) {
    return Math.round(value);
  }
  const factor = 10 ** Math.trunc(args[1] as number);
  return Math.round(value * factor) / factor;
}

/** Run a predicate lambda over one item; v1-shaped boolean requirement. */
function testItem(
  name: string,
  context: FormulaCallContext,
  test: FormulaValue,
  item: FormulaValue,
  index: number
): boolean | FormulaError {
  return requireBooleanValue(context.callLambda(test, [item, index]), name);
}

function evalMap(
  list: readonly FormulaValue[],
  transform: FormulaValue,
  context: FormulaCallContext
): FormulaValue {
  const result: FormulaValue[] = [];
  for (const [index, item] of list.entries()) {
    const mapped = context.callLambda(transform, [item, index]);
    if (isFormulaError(mapped)) {
      return mapped;
    }
    result.push(mapped);
  }
  return result;
}

function evalFilter(
  list: readonly FormulaValue[],
  test: FormulaValue,
  context: FormulaCallContext
): FormulaValue {
  const result: FormulaValue[] = [];
  for (const [index, item] of list.entries()) {
    const keep = testItem("filter", context, test, item, index);
    if (typeof keep !== "boolean") {
      return keep;
    }
    if (keep) {
      result.push(item);
    }
  }
  return result;
}

/** Index of the first matching item, or -1; errors propagate. */
function findMatchIndex(
  name: string,
  list: readonly FormulaValue[],
  test: FormulaValue,
  context: FormulaCallContext
): number | FormulaError {
  for (const [index, item] of list.entries()) {
    const matched = testItem(name, context, test, item, index);
    if (typeof matched !== "boolean") {
      return matched;
    }
    if (matched) {
      return index;
    }
  }
  return -1;
}

function evalSomeEvery(
  name: "some" | "every",
  list: readonly FormulaValue[],
  test: FormulaValue,
  context: FormulaCallContext
): FormulaValue {
  for (const [index, item] of list.entries()) {
    const matched = testItem(name, context, test, item, index);
    if (typeof matched !== "boolean") {
      return matched;
    }
    if (name === "some" && matched) {
      return true;
    }
    if (name === "every" && !matched) {
      return false;
    }
  }
  return name === "every";
}

type SortKind = "number" | "text" | "date";

function sortKindOf(value: FormulaValue): SortKind | null {
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "string") {
    return "text";
  }
  if (value instanceof FormulaDate) {
    return "date";
  }
  return null;
}

interface SortEntry {
  key: FormulaValue;
  value: FormulaValue;
}

function compareSortKeys(a: FormulaValue, b: FormulaValue): number {
  if (a === null || b === null) {
    // Blanks sort last, stably.
    return (a === null ? 1 : 0) - (b === null ? 1 : 0);
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (a instanceof FormulaDate && b instanceof FormulaDate) {
    return a.time - b.time;
  }
  if (typeof a === "string" && typeof b === "string" && a !== b) {
    return a < b ? -1 : 1;
  }
  return 0;
}

/** Validate sort keys: one orderable kind (blanks allowed, sorted last). */
function sortKeyError(name: string, entries: readonly SortEntry[]) {
  let kind: SortKind | null = null;
  for (const entry of entries) {
    if (entry.key === null) {
      continue;
    }
    const keyKind = sortKindOf(entry.key);
    if (keyKind === null) {
      return formulaError(
        `${name}() can only order numbers, text, and dates, got ${formulaValueTypeName(entry.key)}`
      );
    }
    if (kind === null) {
      kind = keyKind;
    } else if (kind !== keyKind) {
      return formulaError(
        `${name}() expects values of one type, got ${kind} and ${keyKind}`
      );
    }
  }
  return null;
}

function evalSort(
  name: string,
  list: readonly FormulaValue[],
  key: FormulaValue | undefined,
  context: FormulaCallContext
): FormulaValue {
  const entries: SortEntry[] = [];
  for (const item of list) {
    const sortKey = key === undefined ? item : context.callLambda(key, [item]);
    if (isFormulaError(sortKey)) {
      return sortKey;
    }
    entries.push({ key: sortKey, value: item });
  }
  const invalid = sortKeyError(name, entries);
  if (invalid !== null) {
    return invalid;
  }
  entries.sort((a, b) => compareSortKeys(a.key, b.key));
  return entries.map((entry) => entry.value);
}

function evalUnique(list: readonly FormulaValue[]): FormulaValue {
  const result: FormulaValue[] = [];
  for (const item of list) {
    if (!result.some((seen) => formulaValuesEqual(seen, item))) {
      result.push(item);
    }
  }
  return result;
}

function evalAt(list: readonly FormulaValue[], index: number): FormulaValue {
  const truncated = Math.trunc(index);
  const resolved = truncated < 0 ? list.length + truncated : truncated;
  if (resolved < 0 || resolved >= list.length) {
    return null;
  }
  return list[resolved];
}

function evalJoin(
  list: readonly FormulaValue[],
  separator: FormulaValue
): FormulaValue {
  const sep = formulaValueToText(separator);
  if (typeof sep !== "string") {
    return sep;
  }
  const fragments = textFragments(list);
  if (isFormulaError(fragments)) {
    return fragments;
  }
  return fragments.join(sep);
}

type FormulaDateUnit = "days" | "months" | "years" | "hours" | "minutes";

const DATE_UNITS = new Map<string, FormulaDateUnit>([
  ["day", "days"],
  ["days", "days"],
  ["month", "months"],
  ["months", "months"],
  ["year", "years"],
  ["years", "years"],
  ["hour", "hours"],
  ["hours", "hours"],
  ["minute", "minutes"],
  ["minutes", "minutes"],
]);

function parseUnitArg(
  value: FormulaValue,
  fnName: string
): FormulaDateUnit | FormulaError {
  const unit =
    typeof value === "string"
      ? DATE_UNITS.get(value.trim().toLowerCase())
      : undefined;
  if (unit === undefined) {
    return formulaError(
      `${fnName}(): unknown unit ${JSON.stringify(value)} — use "days", "months", "years", "hours", or "minutes"`
    );
  }
  return unit;
}

const DATE_SHIFTERS: Record<FormulaDateUnit, (date: Date, n: number) => Date> =
  {
    days: addDays,
    hours: addHours,
    minutes: addMinutes,
    months: addMonths,
    years: addYears,
  };

function evalDateAdd(
  date: FormulaDate,
  amount: number,
  unitArg: FormulaValue
): FormulaValue {
  const unit = parseUnitArg(unitArg, "dateAdd");
  if (typeof unit !== "string") {
    return unit;
  }
  const shifted = DATE_SHIFTERS[unit](date.date, amount);
  if (Number.isNaN(shifted.getTime())) {
    // Amounts past the ECMAScript ±8.64e15 ms range yield an Invalid Date,
    // which date-fns `format` would throw RangeError on (v1 guard).
    return formulaError("dateAdd(): resulting date is out of range");
  }
  const keepsDateOnly = unit !== "hours" && unit !== "minutes";
  return new FormulaDate(shifted, date.dateOnly && keepsDateOnly);
}

function evalDateDiff(
  a: FormulaDate,
  b: FormulaDate,
  unitArg: FormulaValue
): FormulaValue {
  const unit = parseUnitArg(unitArg, "dateDiff");
  if (typeof unit !== "string") {
    return unit;
  }
  switch (unit) {
    case "days":
      return differenceInCalendarDays(a.date, b.date);
    case "months":
      return differenceInCalendarMonths(a.date, b.date);
    case "years":
      return differenceInCalendarYears(a.date, b.date);
    case "hours":
      return differenceInHours(a.date, b.date);
    default:
      return differenceInMinutes(a.date, b.date);
  }
}

const ISO_DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Strict ISO 8601 timestamp: `yyyy-mm-ddTHH:mm`, optional `:ss`, optional
 * `.sss` fraction, optional `Z` or `±hh:mm` offset; a space may replace the
 * `T`. Deliberately narrower than `new Date(string)` — non-ISO string
 * parsing is implementation-defined (ECMA-262 guarantees only the ISO
 * profile), and formulas must evaluate identically in every engine, so the
 * instant is always constructed from the captured parts, never by handing
 * the string to `Date`.
 */
const ISO_TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/;

const MAX_HOUR = 23;
const MAX_MINUTE_SECOND = 59;
const MS_PER_MINUTE = 60_000;

/**
 * Local-midnight `Date` for a calendar day, or `null` when the parts don't
 * name a real day (2026-02-31 would roll over; it is rejected instead).
 * `setFullYear` avoids the `Date` constructor's two-digit-year mapping.
 */
function localCalendarDay(
  year: number,
  month: number,
  day: number
): Date | null {
  const date = new Date(2000, month - 1, day, 0, 0, 0, 0);
  date.setFullYear(year);
  const isRealCalendarDay =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return isRealCalendarDay ? date : null;
}

/** Signed milliseconds for a `±hh:mm` offset lexeme. */
function offsetToMs(offset: string): number {
  const sign = offset.startsWith("-") ? -1 : 1;
  const hours = Number(offset.slice(1, 3));
  const minutes = Number(offset.slice(4, 6));
  const minutesPerHour = 60;
  return sign * (hours * minutesPerHour + minutes) * MS_PER_MINUTE;
}

function parseIsoTimestamp(trimmed: string): FormulaValue {
  const match = ISO_TIMESTAMP_RE.exec(trimmed);
  if (match === null) {
    return null;
  }
  const [year, month, day, hours, minutes] = [
    match[1],
    match[2],
    match[3],
    match[4],
    match[5],
  ].map(Number);
  const seconds = Number(match[6] ?? "0");
  const ms = Number((match[7] ?? "0").padEnd(3, "0"));
  const offset = match[8];
  const invalid =
    localCalendarDay(year, month, day) === null ||
    hours > MAX_HOUR ||
    minutes > MAX_MINUTE_SECOND ||
    seconds > MAX_MINUTE_SECOND;
  if (invalid) {
    return null;
  }
  if (offset === undefined) {
    // No offset: local wall-clock time, per the ISO date-time profile.
    const local = new Date(2000, month - 1, day, hours, minutes, seconds, ms);
    local.setFullYear(year);
    return new FormulaDate(local, false);
  }
  const utc = new Date(
    Date.UTC(2000, month - 1, day, hours, minutes, seconds, ms)
  );
  utc.setUTCFullYear(year);
  const instant =
    offset === "Z" ? utc.getTime() : utc.getTime() - offsetToMs(offset);
  return new FormulaDate(new Date(instant), false);
}

/**
 * Parse text into a date value: `yyyy-mm-dd` (date-only, local, calendar
 * validated) or a strict ISO timestamp ({@link ISO_TIMESTAMP_RE}). Anything
 * else — including engine-dependent formats like "March 5, 2026" — returns
 * BLANK, not an error, so `parseDate(x) ?? fallback` works.
 */
function evalParseDate(text: string): FormulaValue {
  const trimmed = text.trim();
  const match = ISO_DATE_ONLY_RE.exec(trimmed);
  if (match) {
    const [year, month, day] = [match[1], match[2], match[3]].map(Number);
    const date = localCalendarDay(year, month, day);
    return date === null ? null : new FormulaDate(date, true);
  }
  return parseIsoTimestamp(trimmed);
}

function evalFormatDate(date: FormulaDate, pattern: string): FormulaValue {
  try {
    return dateFnsFormat(date.date, pattern);
  } catch {
    return formulaError(`formatDate(): invalid format pattern "${pattern}"`);
  }
}

/** Today per the scope clock: the local calendar day, date-only. */
function scopeToday(scope: FormulaScope): FormulaDate {
  const instant = formulaScopeNow(scope);
  return new FormulaDate(
    new Date(instant.getFullYear(), instant.getMonth(), instant.getDate()),
    true
  );
}

// --- the catalog ------------------------------------------------------------

const LOGIC_FUNCTIONS: readonly FormulaFunctionEntry[] = [
  {
    name: "if",
    category: "logic",
    description:
      "Returns the second argument when the condition is true, otherwise the third (or blank when omitted). Only the taken branch is evaluated.",
    examples: ['if(2 > 1, "yes", "no")', "if(false, 1)"],
    params: [
      { lazy: true, name: "condition", type: BOOLEAN_TYPE },
      { lazy: true, name: "then", type: TYPE_VARIABLE_T },
      { lazy: true, name: "else", optional: true, type: TYPE_VARIABLE_T },
    ],
    returns: TYPE_VARIABLE_T,
    kind: "lazy",
    apply: (args) => {
      const condition = requireBooleanValue(args[0](), "if");
      if (typeof condition !== "boolean") {
        return condition;
      }
      if (condition) {
        return args[1]();
      }
      return args.length > 2 ? args[2]() : null;
    },
  },
  {
    name: "switch",
    category: "logic",
    description:
      "Compares a value against each case in turn and returns the matching result; the trailing argument (if unpaired) is the default, otherwise blank.",
    examples: ['switch(2, 1, "one", 2, "two", "many")'],
    params: [
      { lazy: true, name: "value", type: UNKNOWN_TYPE },
      { lazy: true, name: "case1", type: UNKNOWN_TYPE },
      { lazy: true, name: "result1", type: UNKNOWN_TYPE },
      {
        lazy: true,
        name: "more",
        optional: true,
        type: UNKNOWN_TYPE,
        variadic: true,
      },
    ],
    returns: UNKNOWN_TYPE,
    kind: "lazy",
    apply: (args) => {
      const value = args[0]();
      if (isFormulaError(value)) {
        return value;
      }
      let index = 1;
      while (index + 1 < args.length) {
        const caseValue = args[index]();
        if (isFormulaError(caseValue)) {
          return caseValue;
        }
        if (formulaValuesEqual(value, caseValue)) {
          return args[index + 1]();
        }
        index += 2;
      }
      return index < args.length ? args[index]() : null;
    },
  },
  {
    name: "and",
    category: "logic",
    description:
      "True when every argument is true; stops at the first false (later arguments are not evaluated).",
    examples: ["and(true, 2 > 1)"],
    params: [
      { lazy: true, name: "a", type: BOOLEAN_TYPE },
      { lazy: true, name: "b", type: BOOLEAN_TYPE },
      {
        lazy: true,
        name: "more",
        optional: true,
        type: BOOLEAN_TYPE,
        variadic: true,
      },
    ],
    returns: BOOLEAN_TYPE,
    kind: "lazy",
    apply: (args) => {
      for (const arg of args) {
        const value = requireBooleanValue(arg(), "and");
        if (typeof value !== "boolean") {
          return value;
        }
        if (!value) {
          return false;
        }
      }
      return true;
    },
  },
  {
    name: "or",
    category: "logic",
    description:
      "True when any argument is true; stops at the first true (later arguments are not evaluated).",
    examples: ["or(false, 1 > 2, true)"],
    params: [
      { lazy: true, name: "a", type: BOOLEAN_TYPE },
      { lazy: true, name: "b", type: BOOLEAN_TYPE },
      {
        lazy: true,
        name: "more",
        optional: true,
        type: BOOLEAN_TYPE,
        variadic: true,
      },
    ],
    returns: BOOLEAN_TYPE,
    kind: "lazy",
    apply: (args) => {
      for (const arg of args) {
        const value = requireBooleanValue(arg(), "or");
        if (typeof value !== "boolean") {
          return value;
        }
        if (value) {
          return true;
        }
      }
      return false;
    },
  },
  {
    name: "not",
    category: "logic",
    description: "Inverts a true/false value.",
    examples: ["not(1 > 2)"],
    params: [{ lenient: true, name: "value", type: BOOLEAN_TYPE }],
    returns: BOOLEAN_TYPE,
    kind: "eager",
    apply: (args) => {
      const value = requireBooleanValue(args[0], "not");
      return typeof value === "boolean" ? !value : value;
    },
  },
  {
    name: "empty",
    category: "logic",
    description:
      "True when the value is blank or whitespace-only text; 0 and false are values.",
    examples: ['empty("")', "empty(0)"],
    params: [{ name: "value", type: UNKNOWN_TYPE }],
    returns: BOOLEAN_TYPE,
    kind: "eager",
    apply: (args) =>
      args[0] === null ||
      (typeof args[0] === "string" && args[0].trim().length === 0),
  },
];

const MATH_FUNCTIONS: readonly FormulaFunctionEntry[] = [
  {
    name: "abs",
    category: "math",
    description: "Returns the absolute value of a number.",
    examples: ["abs(-3)"],
    params: [{ name: "value", type: NUMBER_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => Math.abs(args[0] as number),
  },
  {
    name: "ceil",
    category: "math",
    description: "Rounds a number up to the nearest integer.",
    examples: ["ceil(1.2)"],
    params: [{ name: "value", type: NUMBER_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => Math.ceil(args[0] as number),
  },
  {
    name: "floor",
    category: "math",
    description: "Rounds a number down to the nearest integer.",
    examples: ["floor(1.8)"],
    params: [{ name: "value", type: NUMBER_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => Math.floor(args[0] as number),
  },
  {
    name: "round",
    category: "math",
    description:
      "Rounds a number to the nearest integer, or to the given number of decimal digits.",
    examples: ["round(3.456, 2)"],
    params: [
      { name: "value", type: NUMBER_TYPE },
      { name: "digits", optional: true, type: NUMBER_TYPE },
    ],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => evalRound(args),
  },
  {
    name: "sqrt",
    category: "math",
    description: "Returns the square root of a non-negative number.",
    examples: ["sqrt(9)"],
    params: [{ name: "value", type: NUMBER_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => {
      const value = args[0] as number;
      if (value < 0) {
        return formulaError(
          "sqrt(): cannot take the square root of a negative number"
        );
      }
      return Math.sqrt(value);
    },
  },
  {
    name: "mod",
    category: "math",
    description:
      "Returns the remainder after dividing the first number by the second.",
    examples: ["mod(7, 3)"],
    params: [
      { name: "dividend", type: NUMBER_TYPE },
      { name: "divisor", type: NUMBER_TYPE },
    ],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => {
      const divisor = args[1] as number;
      if (divisor === 0) {
        return formulaError("Division by zero");
      }
      return (args[0] as number) % divisor;
    },
  },
  {
    name: "min",
    category: "math",
    description:
      "Returns the smallest of the given numbers, or of one list of numbers (blanks skipped; blank for an empty list).",
    examples: ["min([3, 1, 2])", "min(3, 1, 2)"],
    params: [
      { lenient: true, name: "values", type: NUMBERS_OR_LIST, variadic: true },
    ],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args, context) => evalMinMax(context.name, args, Math.min),
  },
  {
    name: "max",
    category: "math",
    description:
      "Returns the largest of the given numbers, or of one list of numbers (blanks skipped; blank for an empty list).",
    examples: ["max(3, 1, 2)", "max([3, 1, 2])"],
    params: [
      { lenient: true, name: "values", type: NUMBERS_OR_LIST, variadic: true },
    ],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args, context) => evalMinMax(context.name, args, Math.max),
  },
  {
    name: "sum",
    category: "math",
    description:
      "Adds up the given numbers, or one list of numbers (blanks skipped; an empty list sums to 0).",
    examples: ["sum([1, 2, 3])", "sum(1, 2, 3)"],
    params: [
      { lenient: true, name: "values", type: NUMBERS_OR_LIST, variadic: true },
    ],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args, context) => evalSum(context.name, args),
  },
  {
    name: "average",
    aliases: ["avg"],
    category: "math",
    description:
      "Returns the arithmetic mean of the given numbers, or of one list of numbers (blanks skipped; an empty list is an error). Also spelled avg.",
    examples: ["average(2, 4, 6)", "average([2, 4])"],
    params: [
      { lenient: true, name: "values", type: NUMBERS_OR_LIST, variadic: true },
    ],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args, context) => evalAverage(context.name, args),
  },
];

const TEXT_FUNCTIONS: readonly FormulaFunctionEntry[] = [
  {
    name: "concat",
    category: "text",
    description:
      "Joins all of its arguments into one text value (numbers, booleans, blanks, and dates are converted).",
    examples: ['concat("a", 1, true)'],
    params: [
      { lenient: true, name: "values", type: UNKNOWN_TYPE, variadic: true },
    ],
    returns: TEXT_TYPE,
    kind: "eager",
    apply: (args) => {
      const fragments = textFragments(args);
      return isFormulaError(fragments) ? fragments : fragments.join("");
    },
  },
  {
    name: "len",
    category: "text",
    description: "Returns the number of characters in the text.",
    examples: ['len("abc")'],
    params: [{ lenient: true, name: "text", type: TEXT_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => applyText(args[0], (text) => text.length),
  },
  {
    name: "lower",
    category: "text",
    description: "Converts the text to lowercase.",
    examples: ['lower("AbC")'],
    params: [{ lenient: true, name: "text", type: TEXT_TYPE }],
    returns: TEXT_TYPE,
    kind: "eager",
    apply: (args) => applyText(args[0], (text) => text.toLowerCase()),
  },
  {
    name: "upper",
    category: "text",
    description: "Converts the text to uppercase.",
    examples: ['upper("abc")'],
    params: [{ lenient: true, name: "text", type: TEXT_TYPE }],
    returns: TEXT_TYPE,
    kind: "eager",
    apply: (args) => applyText(args[0], (text) => text.toUpperCase()),
  },
  {
    name: "trim",
    category: "text",
    description: "Removes whitespace from both ends of the text.",
    examples: ['trim("  x  ")'],
    params: [{ lenient: true, name: "text", type: TEXT_TYPE }],
    returns: TEXT_TYPE,
    kind: "eager",
    apply: (args) => applyText(args[0], (text) => text.trim()),
  },
  {
    name: "contains",
    category: "text",
    description:
      "True when the text contains the search text (case-sensitive).",
    examples: ['contains("hello", "ell")'],
    params: [
      { lenient: true, name: "text", type: TEXT_TYPE },
      { lenient: true, name: "search", type: TEXT_TYPE },
    ],
    returns: BOOLEAN_TYPE,
    kind: "eager",
    apply: (args) =>
      applyText2(args[0], args[1], (text, search) => text.includes(search)),
  },
  {
    name: "replace",
    category: "text",
    description:
      "Replaces every occurrence of the search text with the replacement (literal, not a pattern).",
    examples: ['replace("a-b-c", "-", "+")'],
    params: [
      { lenient: true, name: "text", type: TEXT_TYPE },
      { lenient: true, name: "search", type: TEXT_TYPE },
      { lenient: true, name: "replacement", type: TEXT_TYPE },
    ],
    returns: TEXT_TYPE,
    kind: "eager",
    apply: (args) =>
      applyText2(args[0], args[1], (text, search) =>
        applyText(args[2], (replacement) =>
          text.replaceAll(search, replacement)
        )
      ),
  },
  {
    name: "startsWith",
    category: "text",
    description: "True when the text starts with the search text.",
    examples: ['startsWith("hello", "he")'],
    params: [
      { lenient: true, name: "text", type: TEXT_TYPE },
      { lenient: true, name: "search", type: TEXT_TYPE },
    ],
    returns: BOOLEAN_TYPE,
    kind: "eager",
    apply: (args) =>
      applyText2(args[0], args[1], (text, search) => text.startsWith(search)),
  },
  {
    name: "endsWith",
    category: "text",
    description: "True when the text ends with the search text.",
    examples: ['endsWith("hello", "lo")'],
    params: [
      { lenient: true, name: "text", type: TEXT_TYPE },
      { lenient: true, name: "search", type: TEXT_TYPE },
    ],
    returns: BOOLEAN_TYPE,
    kind: "eager",
    apply: (args) =>
      applyText2(args[0], args[1], (text, search) => text.endsWith(search)),
  },
  {
    name: "split",
    category: "text",
    description:
      "Splits the text at every occurrence of the separator, returning a list of text.",
    examples: ['split("a,b,c", ",")'],
    params: [
      { lenient: true, name: "text", type: TEXT_TYPE },
      { lenient: true, name: "separator", type: TEXT_TYPE },
    ],
    returns: listTypeOf(TEXT_TYPE),
    kind: "eager",
    apply: (args) =>
      applyText2(args[0], args[1], (text, separator) => text.split(separator)),
  },
  {
    name: "format",
    category: "text",
    description:
      "Formats any value as display text — numbers grouped, booleans as Yes/No, dates as yyyy-mm-dd, lists comma-joined.",
    examples: ["format(1234.5)"],
    params: [{ name: "value", type: UNKNOWN_TYPE }],
    returns: TEXT_TYPE,
    kind: "eager",
    apply: (args) => formulaValueToDisplay(args[0]),
  },
];

const LIST_FUNCTIONS: readonly FormulaFunctionEntry[] = [
  {
    name: "map",
    category: "list",
    description:
      "Transforms every item of a list with a lambda (which may also take the item's index).",
    examples: ["map([1, 2, 3], x => x * 2)"],
    params: [
      { name: "list", type: LIST_OF_T },
      { name: "transform", type: TRANSFORM_TYPE },
    ],
    returns: listTypeOf(TYPE_VARIABLE_U),
    kind: "eager",
    apply: (args, context) =>
      evalMap(args[0] as FormulaValue[], args[1], context),
  },
  {
    name: "filter",
    category: "list",
    description: "Keeps only the items for which the test lambda is true.",
    examples: ["filter([1, 2, 3, 4], x => x > 2)"],
    params: [
      { name: "list", type: LIST_OF_T },
      { name: "test", type: PREDICATE_TYPE },
    ],
    returns: LIST_OF_T,
    kind: "eager",
    apply: (args, context) =>
      evalFilter(args[0] as FormulaValue[], args[1], context),
  },
  {
    name: "find",
    category: "list",
    description:
      "Returns the first item for which the test lambda is true, or blank when none matches.",
    examples: ["find([1, 2, 3], x => x > 1)"],
    params: [
      { name: "list", type: LIST_OF_T },
      { name: "test", type: PREDICATE_TYPE },
    ],
    returns: TYPE_VARIABLE_T,
    kind: "eager",
    apply: (args, context) => {
      const list = args[0] as FormulaValue[];
      const index = findMatchIndex("find", list, args[1], context);
      if (typeof index !== "number") {
        return index;
      }
      return index === -1 ? null : list[index];
    },
  },
  {
    name: "findIndex",
    category: "list",
    description:
      "Returns the 0-based index of the first item for which the test lambda is true, or -1 when none matches.",
    examples: ['findIndex(["a", "b"], x => x == "b")'],
    params: [
      { name: "list", type: LIST_OF_T },
      { name: "test", type: PREDICATE_TYPE },
    ],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args, context) =>
      findMatchIndex("findIndex", args[0] as FormulaValue[], args[1], context),
  },
  {
    name: "some",
    category: "list",
    description:
      "True when the test lambda is true for at least one item (false for an empty list).",
    examples: ["some([1, 2], x => x > 1)"],
    params: [
      { name: "list", type: LIST_OF_T },
      { name: "test", type: PREDICATE_TYPE },
    ],
    returns: BOOLEAN_TYPE,
    kind: "eager",
    apply: (args, context) =>
      evalSomeEvery("some", args[0] as FormulaValue[], args[1], context),
  },
  {
    name: "every",
    category: "list",
    description:
      "True when the test lambda is true for every item (true for an empty list).",
    examples: ["every([1, 2], x => x > 0)"],
    params: [
      { name: "list", type: LIST_OF_T },
      { name: "test", type: PREDICATE_TYPE },
    ],
    returns: BOOLEAN_TYPE,
    kind: "eager",
    apply: (args, context) =>
      evalSomeEvery("every", args[0] as FormulaValue[], args[1], context),
  },
  {
    name: "sort",
    category: "list",
    description:
      "Sorts a list of numbers, text, or dates in ascending order (blanks last), optionally by a lambda-computed key.",
    examples: ["sort([3, 1, 2])", 'sort(["bb", "a"], x => len(x))'],
    params: [
      { name: "list", type: LIST_OF_T },
      { name: "key", optional: true, type: SORT_KEY_TYPE },
    ],
    returns: LIST_OF_T,
    kind: "eager",
    apply: (args, context) =>
      evalSort("sort", args[0] as FormulaValue[], args[1], context),
  },
  {
    name: "unique",
    category: "list",
    description:
      "Removes duplicate items, keeping the first occurrence of each.",
    examples: ["unique([1, 2, 2, 3])"],
    params: [{ name: "list", type: LIST_OF_T }],
    returns: LIST_OF_T,
    kind: "eager",
    apply: (args) => evalUnique(args[0] as FormulaValue[]),
  },
  {
    name: "reverse",
    category: "list",
    description: "Returns the list in reverse order.",
    examples: ["reverse([1, 2, 3])"],
    params: [{ name: "list", type: LIST_OF_T }],
    returns: LIST_OF_T,
    kind: "eager",
    apply: (args) => [...(args[0] as FormulaValue[])].reverse(),
  },
  {
    name: "flat",
    category: "list",
    description: "Flattens nested lists by one level.",
    examples: ["flat([[1], [2, 3]])"],
    params: [{ name: "list", type: listTypeOf(LIST_OF_T) }],
    returns: LIST_OF_T,
    kind: "eager",
    apply: (args) => (args[0] as FormulaValue[]).flat(1) as FormulaValue[],
  },
  {
    name: "first",
    category: "list",
    description: "Returns the first item, or blank for an empty list.",
    examples: ["first([1, 2])"],
    params: [{ name: "list", type: LIST_OF_T }],
    returns: TYPE_VARIABLE_T,
    kind: "eager",
    apply: (args) => (args[0] as FormulaValue[]).at(0) ?? null,
  },
  {
    name: "last",
    category: "list",
    description: "Returns the last item, or blank for an empty list.",
    examples: ["last([1, 2])"],
    params: [{ name: "list", type: LIST_OF_T }],
    returns: TYPE_VARIABLE_T,
    kind: "eager",
    apply: (args) => (args[0] as FormulaValue[]).at(-1) ?? null,
  },
  {
    name: "at",
    category: "list",
    description:
      "Returns the item at a 0-based index (negative counts from the end), or blank when out of range.",
    examples: ['at(["a", "b"], 1)'],
    params: [
      { name: "list", type: LIST_OF_T },
      { name: "index", type: NUMBER_TYPE },
    ],
    returns: TYPE_VARIABLE_T,
    kind: "eager",
    apply: (args) => evalAt(args[0] as FormulaValue[], args[1] as number),
  },
  {
    name: "slice",
    category: "list",
    description:
      "Returns the items from the start index up to (not including) the end index; negatives count from the end.",
    examples: ["slice([1, 2, 3, 4], 1, 3)"],
    params: [
      { name: "list", type: LIST_OF_T },
      { name: "start", type: NUMBER_TYPE },
      { name: "end", optional: true, type: NUMBER_TYPE },
    ],
    returns: LIST_OF_T,
    kind: "eager",
    apply: (args) => {
      const list = args[0] as FormulaValue[];
      const start = Math.trunc(args[1] as number);
      const end = args.length > 2 ? Math.trunc(args[2] as number) : undefined;
      return list.slice(start, end);
    },
  },
  {
    name: "includes",
    category: "list",
    description: "True when the list contains the value (== semantics).",
    examples: ["includes([1, 2], 2)"],
    params: [
      { name: "list", type: LIST_OF_T },
      { name: "value", type: TYPE_VARIABLE_T },
    ],
    returns: BOOLEAN_TYPE,
    kind: "eager",
    apply: (args) =>
      (args[0] as FormulaValue[]).some((item) =>
        formulaValuesEqual(item, args[1])
      ),
  },
  {
    name: "length",
    category: "list",
    description: "Returns the number of items in the list, blanks included.",
    examples: ["length([1, 2, 3])"],
    params: [{ name: "list", type: LIST_OF_T }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => (args[0] as FormulaValue[]).length,
  },
  {
    name: "join",
    category: "list",
    description:
      "Joins the items into one text value with the separator between them.",
    examples: ['join([1, 2, 3], "-")'],
    params: [
      { name: "list", type: LIST_OF_T },
      { lenient: true, name: "separator", type: TEXT_TYPE },
    ],
    returns: TEXT_TYPE,
    kind: "eager",
    apply: (args) => evalJoin(args[0] as FormulaValue[], args[1]),
  },
  {
    name: "count",
    category: "list",
    description: "Returns the number of non-blank items in the list.",
    examples: ["count([1, null, 2])"],
    params: [{ name: "list", type: LIST_OF_T }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) =>
      (args[0] as FormulaValue[]).filter((item) => item !== null).length,
  },
];

const DATE_FUNCTIONS: readonly FormulaFunctionEntry[] = [
  {
    name: "now",
    category: "time",
    description: "Returns the current date and time.",
    examples: ['formatDate(now(), "yyyy")'],
    params: [],
    returns: DATE_TYPE,
    volatile: true,
    kind: "eager",
    apply: (_args, context) =>
      new FormulaDate(formulaScopeNow(context.scope), false),
  },
  {
    name: "today",
    category: "date",
    description: "Returns today's date (no time part).",
    examples: ["year(today())"],
    params: [],
    returns: DATE_TYPE,
    volatile: true,
    kind: "eager",
    apply: (_args, context) => scopeToday(context.scope),
  },
  {
    name: "parseDate",
    category: "date",
    description:
      'Parses ISO text — "2026-03-05", or a timestamp like "2026-03-05T10:30" with optional seconds and Z/±hh:mm offset — into a date; blank otherwise (pair with ?? for a fallback).',
    examples: ['parseDate("2026-03-05")', 'parseDate("nope") ?? "no date"'],
    params: [{ name: "text", type: TEXT_TYPE }],
    returns: unionTypeOf(DATE_TYPE, BLANK_TYPE),
    kind: "eager",
    apply: (args) => evalParseDate(args[0] as string),
  },
  {
    name: "formatDate",
    category: "date",
    description:
      'Formats a date with a pattern like "MMM d, yyyy" (date-fns tokens).',
    examples: ['formatDate(parseDate("2026-03-05"), "MMM d")'],
    params: [
      { name: "date", type: DATE_TYPE },
      { name: "pattern", type: TEXT_TYPE },
    ],
    returns: TEXT_TYPE,
    kind: "eager",
    apply: (args) => evalFormatDate(args[0] as FormulaDate, args[1] as string),
  },
  {
    name: "dateAdd",
    category: "date",
    description:
      'Shifts a date by an amount of "days", "months", "years", "hours", or "minutes".',
    examples: ['dateAdd(parseDate("2026-01-01"), 10, "days")'],
    params: [
      { name: "date", type: DATE_TYPE },
      { name: "amount", type: NUMBER_TYPE },
      { lenient: true, name: "unit", type: TEXT_TYPE },
    ],
    returns: DATE_TYPE,
    kind: "eager",
    apply: (args) =>
      evalDateAdd(args[0] as FormulaDate, args[1] as number, args[2]),
  },
  {
    name: "dateDiff",
    category: "date",
    description:
      "Returns the difference between two dates in the given unit (calendar difference for days/months/years).",
    examples: [
      'dateDiff(parseDate("2026-01-10"), parseDate("2026-01-01"), "days")',
    ],
    params: [
      { name: "a", type: DATE_TYPE },
      { name: "b", type: DATE_TYPE },
      { lenient: true, name: "unit", type: TEXT_TYPE },
    ],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) =>
      evalDateDiff(args[0] as FormulaDate, args[1] as FormulaDate, args[2]),
  },
  {
    name: "year",
    category: "date",
    description: "Returns the calendar year of a date.",
    examples: ['year(parseDate("2026-03-05"))'],
    params: [{ name: "date", type: DATE_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => (args[0] as FormulaDate).date.getFullYear(),
  },
  {
    name: "month",
    category: "date",
    description: "Returns the month of a date, 1 (January) through 12.",
    examples: ['month(parseDate("2026-03-05"))'],
    params: [{ name: "date", type: DATE_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => (args[0] as FormulaDate).date.getMonth() + 1,
  },
  {
    name: "day",
    category: "date",
    description: "Returns the day of the month of a date, 1 through 31.",
    examples: ['day(parseDate("2026-03-05"))'],
    params: [{ name: "date", type: DATE_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => (args[0] as FormulaDate).date.getDate(),
  },
  {
    name: "weekday",
    category: "date",
    description:
      "Returns the day of the week of a date, 1 (Monday) through 7 (Sunday).",
    examples: ['weekday(parseDate("2026-03-05"))'],
    params: [{ name: "date", type: DATE_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => (((args[0] as FormulaDate).date.getDay() + 6) % 7) + 1,
  },
  {
    name: "hour",
    category: "time",
    description: "Returns the hour of a date, 0 through 23.",
    examples: ['hour(parseDate("2026-03-05T10:30:00"))'],
    params: [{ name: "date", type: DATE_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => (args[0] as FormulaDate).date.getHours(),
  },
  {
    name: "minute",
    category: "time",
    description: "Returns the minute of a date, 0 through 59.",
    examples: ['minute(parseDate("2026-03-05T10:30:00"))'],
    params: [{ name: "date", type: DATE_TYPE }],
    returns: NUMBER_TYPE,
    kind: "eager",
    apply: (args) => (args[0] as FormulaDate).date.getMinutes(),
  },
];

/** Every stdlib function, grouped by category for the docs UI. */
export const FORMULA_FUNCTION_CATALOG: readonly FormulaFunctionEntry[] = [
  ...LOGIC_FUNCTIONS,
  ...MATH_FUNCTIONS,
  ...TEXT_FUNCTIONS,
  ...LIST_FUNCTIONS,
  ...DATE_FUNCTIONS,
];

const FUNCTION_INDEX = new Map<string, FormulaFunctionEntry>();
for (const entry of FORMULA_FUNCTION_CATALOG) {
  FUNCTION_INDEX.set(entry.name.toLowerCase(), entry);
  for (const alias of entry.aliases ?? []) {
    FUNCTION_INDEX.set(alias.toLowerCase(), entry);
  }
}

/** Case-insensitive catalog lookup, aliases included. */
export function formulaFunctionForName(
  name: string
): FormulaFunctionEntry | undefined {
  return FUNCTION_INDEX.get(name.toLowerCase());
}

/**
 * Lowercased names (aliases included) whose results depend on the clock —
 * the volatility source for `isVolatileFormula`.
 */
export const VOLATILE_FORMULA_FUNCTION_NAMES: ReadonlySet<string> = new Set(
  FORMULA_FUNCTION_CATALOG.filter((entry) => entry.volatile).flatMap(
    (entry) => [
      entry.name.toLowerCase(),
      ...(entry.aliases ?? []).map((alias) => alias.toLowerCase()),
    ]
  )
);
