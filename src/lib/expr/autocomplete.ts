/**
 * Context detection for the formula builder's autocomplete. Given the source
 * and caret, decides whether the user is:
 *  - after a scope-root dot (`Page.`) → suggest PROPERTIES, or
 *  - after a value dot (`Page.Title.`, `round(x).`) → suggest METHODS valid for
 *    that value's type (the "chain like `Title.upper().len()`" experience), or
 *  - nowhere special → the normal browsable list.
 *
 * Pure and display-only: the panel still owns rendering + type inference. The
 * receiver *type* is derived by the caller (it has the field schema); this
 * module only extracts the structural context and the method vocabulary.
 */

import type { ExprType } from "@/lib/expr/infer-type.ts";

/** Scope roots (lowercased) — mirrors `parse.ts`; a dot after one is property access. */
const SCOPE_ROOTS = new Set(["page", "row", "thispage", "thisrow"]);

/**
 * Function name (lowercased) → the type it reads as its first argument, i.e.
 * the value you would chain it onto (`text.upper()`, `number.round()`).
 * `"any"` functions apply to every type. Functions absent here (control flow,
 * varargs like `sum`/`concat`, operators) are never offered as methods.
 */
export const METHOD_RECEIVER: Record<string, ExprType | "any"> = {
  // text
  upper: "text",
  lower: "text",
  trim: "text",
  len: "text",
  capitalize: "text",
  contains: "text",
  startswith: "text",
  endswith: "text",
  indexof: "text",
  replace: "text",
  substring: "text",
  padstart: "text",
  padend: "text",
  repeat: "text",
  regexmatch: "text",
  regexextract: "text",
  regexreplace: "text",
  // number
  round: "number",
  floor: "number",
  ceil: "number",
  abs: "number",
  sign: "number",
  sqrt: "number",
  pow: "number",
  mod: "number",
  clamp: "number",
  log: "number",
  log10: "number",
  exp: "number",
  roundup: "number",
  rounddown: "number",
  roundtomultiple: "number",
  currency: "number",
  percent: "number",
  compact: "number",
  formatnumber: "number",
  // date
  formatdate: "date",
  dateadd: "date",
  datediff: "date",
  year: "date",
  month: "date",
  day: "date",
  weekday: "date",
  dayname: "date",
  monthname: "date",
  startof: "date",
  endof: "date",
  issameday: "date",
  fromnow: "date",
  timeago: "date",
  // list
  count: "list",
  length: "list",
  first: "list",
  last: "list",
  at: "list",
  includes: "list",
  join: "list",
  unique: "list",
  reverse: "list",
  slice: "list",
  sort: "list",
  map: "list",
  filter: "list",
  find: "list",
  some: "list",
  every: "list",
  countif: "list",
  sum: "list",
  average: "list",
  avg: "list",
  min: "list",
  max: "list",
  // any value
  format: "any",
  totext: "any",
  tonumber: "any",
  todate: "any",
  toboolean: "any",
  empty: "any",
  isempty: "any",
  isnotempty: "any",
  isnumber: "any",
  istext: "any",
  isboolean: "any",
  isdate: "any",
};

/** Whether a function (by canonical name) can be offered as a method of `type`. */
export function isMethodOf(name: string, type: ExprType): boolean {
  const receiver = METHOD_RECEIVER[name.toLowerCase()];
  if (receiver === undefined) {
    return false;
  }
  // Unknown receiver type → offer every method; `any` methods apply always.
  return receiver === "any" || type === "unknown" || receiver === type;
}

const IDENT_PART = /[A-Za-z0-9_]/;
const TRAILING_DOT = /\.([A-Za-z_][A-Za-z0-9_]*)?$/;

/** From a closing quote (scanning left), return the index just past its opening quote. */
function skipStringLeft(source: string, closeIndex: number): number {
  const quote = source[closeIndex];
  let index = closeIndex - 1;
  while (index >= 0 && source[index] !== quote) {
    index -= 1;
  }
  return index - 1;
}

/** Whether `char` continues a chained receiver at bracket depth 0. */
function continuesReceiver(char: string): boolean {
  return IDENT_PART.test(char) || char === "." || char === " ";
}

/**
 * Walk left from the method dot at `dotIndex` over a chained expression
 * (identifiers, `.`, balanced `()`/`[]`, string literals) to find the receiver
 * — the value the method would attach to. Returns its text and start index.
 */
function receiverBefore(
  source: string,
  dotIndex: number
): { start: number; text: string } {
  let depth = 0;
  let index = dotIndex - 1;
  while (index >= 0) {
    const char = source[index];
    if (char === ")" || char === "]") {
      depth += 1;
      index -= 1;
    } else if (char === "(" || char === "[") {
      if (depth === 0) {
        break;
      }
      depth -= 1;
      index -= 1;
    } else if (depth > 0) {
      index -= 1;
    } else if (char === '"' || char === "'") {
      index = skipStringLeft(source, index);
    } else if (continuesReceiver(char)) {
      index -= 1;
    } else {
      break;
    }
  }
  const start = index + 1;
  return { start, text: source.slice(start, dotIndex).trim() };
}

/** The autocomplete context implied by the caret. */
export type CaretContext =
  | { kind: "none" }
  | { kind: "property"; partial: string; replaceFrom: number }
  | {
      kind: "method";
      partial: string;
      receiver: string;
      replaceFrom: number;
    };

/**
 * Classify the caret position for autocomplete. `replaceFrom` is where an
 * accepted suggestion should start replacing (through the caret): the whole
 * `Page.partial` for a property, or just the partial method name for a method.
 */
export function formulaCaretContext(
  source: string,
  caret: number
): CaretContext {
  const before = source.slice(0, Math.max(0, caret));
  const match = before.match(TRAILING_DOT);
  if (!match) {
    return { kind: "none" };
  }
  const partial = match[1] ?? "";
  const dotIndex = before.length - match[0].length;
  const receiver = receiverBefore(source, dotIndex);
  if (receiver.text === "") {
    return { kind: "none" };
  }
  if (SCOPE_ROOTS.has(receiver.text.toLowerCase())) {
    return { kind: "property", partial, replaceFrom: receiver.start };
  }
  return {
    kind: "method",
    receiver: receiver.text,
    partial,
    replaceFrom: dotIndex + 1,
  };
}
