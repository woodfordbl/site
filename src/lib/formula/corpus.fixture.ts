/**
 * FROZEN v1 compatibility contract — do not edit expectations.
 *
 * Every entry is a runnable example from the retired v1 engine's function
 * catalog (deleted with the engine), paired with the display string the v1
 * engine produced for it on a blank
 * scope (every property empty) with the shared fixed clock
 * (`FORMULA_FIXED_NOW_ISO`). The values were captured by running the v1
 * engine one last time before deletion; `parse.test.ts` asserts every
 * expression still parses to a call of the documented function, and
 * `evaluate.test.ts` asserts the v2 engine displays each one identically —
 * except for the deliberate divergences its `DIVERGENCES` map documents.
 */

/** One frozen v1 catalog example. */
export interface V1CorpusEntry {
  /** The v1 display output on a blank scope (fixed clock). */
  readonly expectedDisplay: string;
  readonly expression: string;
  /** The catalog function the example documents. */
  readonly name: string;
}

/** The v1 function-catalog examples with their v1 engine outputs. */
export const V1_GOLDEN_CORPUS: readonly V1CorpusEntry[] = [
  {
    name: "if",
    expression: 'if(thisPage.Done, "✓", "…")',
    expectedDisplay: '⚠ "if" expects a boolean, got empty',
  },
  {
    name: "empty",
    expression: 'if(empty(thisPage.Notes), "Todo", "Done")',
    expectedDisplay: "Todo",
  },
  {
    name: "round",
    expression: "round(thisPage.Price * 1.1, 2)",
    expectedDisplay: '⚠ Cannot apply "*" to empty and number',
  },
  {
    name: "floor",
    expression: "floor(thisPage.Price)",
    expectedDisplay: "⚠ floor() expects a number, got empty",
  },
  {
    name: "ceil",
    expression: "ceil(thisPage.Price)",
    expectedDisplay: "⚠ ceil() expects a number, got empty",
  },
  {
    name: "abs",
    expression: "abs(thisPage.Price - 100)",
    expectedDisplay: '⚠ Cannot apply "-" to empty and number',
  },
  {
    name: "min",
    expression: "min(thisPage.Price, 100)",
    expectedDisplay: "⚠ min() expects a number, got empty",
  },
  {
    name: "max",
    expression: "max(0, thisPage.Price)",
    expectedDisplay: "⚠ max() expects a number, got empty",
  },
  {
    name: "sum",
    expression: "sum(thisPage.Price, thisPage.Shipping)",
    expectedDisplay: "⚠ sum() expects a number, got empty",
  },
  {
    name: "average",
    expression: "average(thisPage.Q1, thisPage.Q2)",
    expectedDisplay: "⚠ average() expects a number, got empty",
  },
  {
    name: "concat",
    expression: 'concat(thisPage.Name, " — ", thisPage.Status)',
    expectedDisplay: " — ",
  },
  {
    name: "len",
    expression: "len(thisPage.Name)",
    expectedDisplay: "0",
  },
  {
    name: "lower",
    expression: "lower(thisPage.Name)",
    expectedDisplay: "",
  },
  {
    name: "upper",
    expression: "upper(thisPage.Status)",
    expectedDisplay: "",
  },
  {
    name: "trim",
    expression: "trim(thisPage.Name)",
    expectedDisplay: "",
  },
  {
    name: "contains",
    expression: 'contains(thisPage.Name, "draft")',
    expectedDisplay: "No",
  },
  {
    name: "replace",
    expression: 'replace(thisPage.Phone, "-", "")',
    expectedDisplay: "",
  },
  {
    name: "format",
    expression: 'format(thisPage.Price) + " USD"',
    expectedDisplay: " USD",
  },
  {
    name: "formatDate",
    expression: 'formatDate(thisPage.Due, "MMM d")',
    expectedDisplay: "⚠ formatDate() expects a date string, got empty",
  },
  {
    name: "dateAdd",
    expression: 'dateAdd(today(), 7, "days")',
    expectedDisplay: "2020-01-08",
  },
  {
    name: "dateDiff",
    expression: 'dateDiff(thisPage.Due, today(), "days")',
    expectedDisplay: "⚠ dateDiff() expects a date string, got empty",
  },
  {
    name: "today",
    expression: 'dateDiff(thisPage.Due, today(), "days") < 7',
    expectedDisplay: "⚠ dateDiff() expects a date string, got empty",
  },
  {
    name: "now",
    expression: 'formatDate(now(), "MMM d, HH:mm")',
    expectedDisplay: "Jan 1, 00:00",
  },
];
