/**
 * UI catalog for the shared expression language — the single source of truth
 * the formula builder renders (signatures, descriptions, runnable examples).
 * Implementations live in `evaluate.ts`; `function-catalog.test.ts` asserts
 * the two never drift (every implemented function appears here, every alias
 * resolves, every example parses).
 */

/** Section a function is listed under in the builder. */
export type ExprFunctionCategory = "logic" | "math" | "text" | "date" | "time";

/** One documented function: what the builder lists, previews, and inserts. */
export interface ExprFunctionCatalogEntry {
  /** Additional accepted spellings (e.g. `avg` for `average`). */
  readonly aliases?: readonly string[];
  readonly category: ExprFunctionCategory;
  /** One sentence, sentence case. */
  readonly description: string;
  /** A runnable expression demonstrating the function (must parse). */
  readonly example: string;
  /** Canonical (insertable) name, in the casing the docs use. */
  readonly name: string;
  /** Human signature, e.g. `round(number, digits?)`. */
  readonly signature: string;
}

/** Every implemented expression function, grouped for the builder's list. */
export const EXPR_FUNCTION_CATALOG: readonly ExprFunctionCatalogEntry[] = [
  // Logic
  {
    name: "if",
    signature: "if(condition, then, else)",
    description:
      "Returns the second argument when the condition is true, otherwise the third.",
    example: 'if(thisPage.Done, "✓", "…")',
    category: "logic",
  },
  {
    name: "empty",
    aliases: ["isEmpty"],
    signature: "empty(value)",
    description:
      "True when the value is blank text or has no value at all (also spelled isEmpty).",
    example: 'if(empty(thisPage.Notes), "Todo", "Done")',
    category: "logic",
  },
  {
    name: "isNotEmpty",
    signature: "isNotEmpty(value)",
    description: "True when the value has any non-blank content.",
    example: 'if(isNotEmpty(thisPage.Notes), "✓", "")',
    category: "logic",
  },
  {
    name: "isNumber",
    signature: "isNumber(value)",
    description: "True when the value is a number.",
    example: "isNumber(thisPage.Price)",
    category: "logic",
  },
  {
    name: "isText",
    signature: "isText(value)",
    description: "True when the value is text.",
    example: "isText(thisPage.Name)",
    category: "logic",
  },
  {
    name: "isBoolean",
    signature: "isBoolean(value)",
    description: "True when the value is a true/false value.",
    example: "isBoolean(thisPage.Done)",
    category: "logic",
  },
  {
    name: "isDate",
    signature: "isDate(value)",
    description: "True when the value is a valid date.",
    example: "isDate(thisPage.Due)",
    category: "logic",
  },
  {
    name: "xor",
    signature: "xor(a, b)",
    description: "True when exactly one of the two booleans is true.",
    example: "xor(thisPage.Done, thisPage.Archived)",
    category: "logic",
  },
  // Math
  {
    name: "round",
    signature: "round(number, digits?)",
    description:
      "Rounds a number to the nearest integer, or to the given number of decimal digits.",
    example: "round(thisPage.Price * 1.1, 2)",
    category: "math",
  },
  {
    name: "floor",
    signature: "floor(number)",
    description: "Rounds a number down to the nearest integer.",
    example: "floor(thisPage.Price)",
    category: "math",
  },
  {
    name: "ceil",
    signature: "ceil(number)",
    description: "Rounds a number up to the nearest integer.",
    example: "ceil(thisPage.Price)",
    category: "math",
  },
  {
    name: "abs",
    signature: "abs(number)",
    description: "Returns the absolute value of a number.",
    example: "abs(thisPage.Price - 100)",
    category: "math",
  },
  {
    name: "min",
    signature: "min(number, …)",
    description: "Returns the smallest of the given numbers.",
    example: "min(thisPage.Price, 100)",
    category: "math",
  },
  {
    name: "max",
    signature: "max(number, …)",
    description: "Returns the largest of the given numbers.",
    example: "max(0, thisPage.Price)",
    category: "math",
  },
  {
    name: "sum",
    signature: "sum(number, …)",
    description: "Adds up all of the given numbers.",
    example: "sum(thisPage.Price, thisPage.Shipping)",
    category: "math",
  },
  {
    name: "average",
    aliases: ["avg"],
    signature: "average(number, …)",
    description:
      "Returns the arithmetic mean of the given numbers (also spelled avg).",
    example: "average(thisPage.Q1, thisPage.Q2)",
    category: "math",
  },
  {
    name: "mod",
    signature: "mod(a, b)",
    description:
      "Returns the remainder of a divided by b (the % operator, as a function).",
    example: "mod(thisPage.Count, 2)",
    category: "math",
  },
  {
    name: "pow",
    signature: "pow(base, exponent)",
    description: "Raises base to the power of exponent.",
    example: "pow(thisPage.Side, 2)",
    category: "math",
  },
  {
    name: "sqrt",
    signature: "sqrt(number)",
    description: "Returns the square root of a number.",
    example: "sqrt(thisPage.Area)",
    category: "math",
  },
  {
    name: "clamp",
    signature: "clamp(number, low, high)",
    description: "Constrains a number to the range between low and high.",
    example: "clamp(thisPage.Score, 0, 100)",
    category: "math",
  },
  {
    name: "sign",
    signature: "sign(number)",
    description:
      "Returns -1, 0, or 1 for a negative, zero, or positive number.",
    example: "sign(thisPage.Balance)",
    category: "math",
  },
  {
    name: "log",
    signature: "log(number, base?)",
    description: "Natural logarithm, or the logarithm to the given base.",
    example: "log(thisPage.Value, 10)",
    category: "math",
  },
  {
    name: "log10",
    signature: "log10(number)",
    description: "Returns the base-10 logarithm of a number.",
    example: "log10(thisPage.Value)",
    category: "math",
  },
  {
    name: "exp",
    signature: "exp(number)",
    description: "Returns e raised to the power of a number.",
    example: "exp(thisPage.Rate)",
    category: "math",
  },
  {
    name: "roundUp",
    signature: "roundUp(number, digits?)",
    description:
      "Rounds a number up (toward +∞) to the given number of decimal digits.",
    example: "roundUp(thisPage.Price, 2)",
    category: "math",
  },
  {
    name: "roundDown",
    signature: "roundDown(number, digits?)",
    description:
      "Rounds a number down (toward −∞) to the given number of decimal digits.",
    example: "roundDown(thisPage.Price, 2)",
    category: "math",
  },
  {
    name: "roundToMultiple",
    signature: "roundToMultiple(number, multiple)",
    description: "Rounds a number to the nearest multiple of another number.",
    example: "roundToMultiple(thisPage.Price, 5)",
    category: "math",
  },
  {
    name: "toNumber",
    signature: "toNumber(value)",
    description: "Converts text or a true/false value into a number.",
    example: "toNumber(thisPage.Code)",
    category: "math",
  },
  // Text
  {
    name: "concat",
    signature: "concat(value, …)",
    description: "Joins all of its arguments into one text value.",
    example: 'concat(thisPage.Name, " — ", thisPage.Status)',
    category: "text",
  },
  {
    name: "len",
    signature: "len(text)",
    description: "Returns the number of characters in the text.",
    example: "len(thisPage.Name)",
    category: "text",
  },
  {
    name: "lower",
    signature: "lower(text)",
    description: "Converts the text to lowercase.",
    example: "lower(thisPage.Name)",
    category: "text",
  },
  {
    name: "upper",
    signature: "upper(text)",
    description: "Converts the text to uppercase.",
    example: "upper(thisPage.Status)",
    category: "text",
  },
  {
    name: "trim",
    signature: "trim(text)",
    description: "Removes whitespace from both ends of the text.",
    example: "trim(thisPage.Name)",
    category: "text",
  },
  {
    name: "contains",
    signature: "contains(text, search)",
    description: "True when the text contains the search text.",
    example: 'contains(thisPage.Name, "draft")',
    category: "text",
  },
  {
    name: "replace",
    signature: "replace(text, search, replacement)",
    description:
      "Replaces every occurrence of the search text with the replacement.",
    example: 'replace(thisPage.Phone, "-", "")',
    category: "text",
  },
  {
    name: "format",
    signature: "format(value)",
    description:
      "Formats any value as display text — numbers grouped, booleans as Yes/No.",
    example: 'format(thisPage.Price) + " USD"',
    category: "text",
  },
  {
    name: "substring",
    signature: "substring(text, start, end?)",
    description:
      "Extracts the characters from the 0-based start index up to (not including) end.",
    example: "substring(thisPage.Code, 0, 3)",
    category: "text",
  },
  {
    name: "startsWith",
    signature: "startsWith(text, prefix)",
    description: "True when the text begins with the given prefix.",
    example: 'startsWith(thisPage.Name, "draft")',
    category: "text",
  },
  {
    name: "endsWith",
    signature: "endsWith(text, suffix)",
    description: "True when the text ends with the given suffix.",
    example: 'endsWith(thisPage.File, ".pdf")',
    category: "text",
  },
  {
    name: "indexOf",
    signature: "indexOf(text, search)",
    description:
      "The 0-based index of the first occurrence of search, or -1 when it is absent.",
    example: 'indexOf(thisPage.Email, "@")',
    category: "text",
  },
  {
    name: "padStart",
    signature: "padStart(text, length, pad?)",
    description:
      "Pads the start of the text with pad (default space) until it reaches length.",
    example: 'padStart(thisPage.Id, 5, "0")',
    category: "text",
  },
  {
    name: "padEnd",
    signature: "padEnd(text, length, pad?)",
    description:
      "Pads the end of the text with pad (default space) until it reaches length.",
    example: 'padEnd(thisPage.Name, 10, " ")',
    category: "text",
  },
  {
    name: "repeat",
    signature: "repeat(text, count)",
    description: "Repeats the text count times.",
    example: 'repeat("•", thisPage.Level)',
    category: "text",
  },
  {
    name: "capitalize",
    signature: "capitalize(text)",
    description: "Uppercases the first character of the text.",
    example: "capitalize(thisPage.Status)",
    category: "text",
  },
  {
    name: "regexMatch",
    signature: "regexMatch(text, pattern)",
    description:
      "True when the regular expression pattern matches anywhere in the text.",
    example: 'regexMatch(thisPage.Email, "^[^@]+@[^@]+$")',
    category: "text",
  },
  {
    name: "regexExtract",
    signature: "regexExtract(text, pattern)",
    description:
      "Returns the first match of the regular expression, or empty text when there is none.",
    example: 'regexExtract(thisPage.Note, "#\\\\w+")',
    category: "text",
  },
  {
    name: "regexReplace",
    signature: "regexReplace(text, pattern, replacement)",
    description:
      "Replaces every regular-expression match with the replacement text.",
    example: 'regexReplace(thisPage.Phone, "[^0-9]", "")',
    category: "text",
  },
  // Date
  {
    name: "formatDate",
    signature: "formatDate(date, pattern)",
    description:
      'Formats a date with a pattern like "MMM d, yyyy" (date-fns tokens).',
    example: 'formatDate(thisPage.Due, "MMM d")',
    category: "date",
  },
  {
    name: "dateAdd",
    signature: "dateAdd(date, amount, unit)",
    description: 'Shifts a date by an amount of "days", "months", or "years".',
    example: 'dateAdd(today(), 7, "days")',
    category: "date",
  },
  {
    name: "dateDiff",
    signature: "dateDiff(a, b, unit)",
    description:
      "Returns the calendar difference between two dates in the given unit.",
    example: 'dateDiff(thisPage.Due, today(), "days")',
    category: "date",
  },
  {
    name: "today",
    signature: "today()",
    description: "Returns today's date as yyyy-mm-dd.",
    example: 'dateDiff(thisPage.Due, today(), "days") < 7',
    category: "date",
  },
  {
    name: "year",
    signature: "year(date)",
    description: "Returns the 4-digit year of a date.",
    example: "year(thisPage.Due)",
    category: "date",
  },
  {
    name: "month",
    signature: "month(date)",
    description:
      "Returns the month of a date as a number from 1 (January) to 12.",
    example: "month(thisPage.Due)",
    category: "date",
  },
  {
    name: "day",
    signature: "day(date)",
    description: "Returns the day of the month (1–31) of a date.",
    example: "day(thisPage.Due)",
    category: "date",
  },
  {
    name: "weekday",
    signature: "weekday(date)",
    description:
      "Returns the day of the week as a number from 0 (Sunday) to 6 (Saturday).",
    example: "weekday(thisPage.Due) == 0",
    category: "date",
  },
  {
    name: "dayName",
    signature: "dayName(date)",
    description: 'Returns the full weekday name of a date, e.g. "Monday".',
    example: "dayName(thisPage.Due)",
    category: "date",
  },
  {
    name: "monthName",
    signature: "monthName(date)",
    description: 'Returns the full month name of a date, e.g. "January".',
    example: "monthName(thisPage.Due)",
    category: "date",
  },
  {
    name: "startOf",
    signature: "startOf(date, unit)",
    description:
      'Snaps a date to the start of its "day", "week", "month", or "year".',
    example: 'startOf(thisPage.Due, "month")',
    category: "date",
  },
  {
    name: "endOf",
    signature: "endOf(date, unit)",
    description:
      'Snaps a date to the end of its "day", "week", "month", or "year".',
    example: 'endOf(thisPage.Due, "month")',
    category: "date",
  },
  {
    name: "isSameDay",
    signature: "isSameDay(a, b)",
    description: "True when two dates fall on the same calendar day.",
    example: "isSameDay(thisPage.Due, today())",
    category: "date",
  },
  // Time
  {
    name: "now",
    signature: "now()",
    description: "Returns the current date and time as an ISO timestamp.",
    example: 'formatDate(now(), "MMM d, HH:mm")',
    category: "time",
  },
];

/** Section an operator is listed under in the builder. */
export type ExprOperatorCategory = "arithmetic" | "comparison" | "logic";

/** One documented operator row: symbol as typed, plus a one-line description. */
export interface ExprOperatorCatalogEntry {
  readonly category: ExprOperatorCategory;
  /** One sentence, sentence case. */
  readonly description: string;
  /** The operator exactly as typed in an expression. */
  readonly symbol: string;
}

/** Every expression operator, grouped for the builder's list. */
export const EXPR_OPERATOR_CATALOG: readonly ExprOperatorCatalogEntry[] = [
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
];

/**
 * Bare-identifier rule, mirroring the tokenizer's `IDENTIFIER_START_RE` /
 * `IDENTIFIER_PART_RE`: names outside it need the bracket reference form.
 */
const BARE_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The `thisPage` reference expression for a property name: dot form for
 * bare identifiers (`thisPage.Price`), bracket form with string escaping
 * otherwise (`thisPage["Unit Price"]`). Always parses.
 */
export function formulaPropertyReference(name: string): string {
  if (BARE_IDENTIFIER_RE.test(name)) {
    return `thisPage.${name}`;
  }
  const escaped = name.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `thisPage["${escaped}"]`;
}
