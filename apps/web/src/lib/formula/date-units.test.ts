/**
 * @fileoverview The unit argument accepted by `dateAdd` / `dateDiff`.
 *
 * The vocabulary is closed and shared by both functions, so it is asserted
 * once here rather than twice among the general date cases: every accepted
 * unit shifts and measures the same way, and anything outside it is a
 * runtime error rather than a silent no-op.
 */
import { describe, expect, it } from "vitest";

import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import {
  type FormulaScope,
  type FormulaValue,
  formulaError,
  isFormulaError,
} from "@/lib/formula/values.ts";

const EMPTY_SCOPE: FormulaScope = {
  getProperty: (name) => formulaError(`Unknown property "${name}"`),
};

function run(source: string): FormulaValue {
  const parsed = parseFormula(source);
  if (!parsed.ok) {
    throw new Error(
      `parse failed for ${JSON.stringify(source)}: ${parsed.error.message}`
    );
  }
  return evaluateFormula(parsed.ast, EMPTY_SCOPE);
}

function errorMessage(value: FormulaValue): string {
  if (!isFormulaError(value)) {
    throw new Error(`expected a FormulaError, got ${JSON.stringify(value)}`);
  }
  return value.message;
}

describe("date units", () => {
  it("dateAdd supports weeks", () => {
    expect(run('format(dateAdd(parseDate("2026-01-01"), 1, "weeks"))')).toBe(
      "2026-01-08"
    );
    expect(
      run('dateDiff(parseDate("2026-01-15"), parseDate("2026-01-01"), "weeks")')
    ).toBe(2);
  });

  it("dateAdd rejects bad input like v1", () => {
    expect(
      errorMessage(run('dateAdd(parseDate("2026-01-01"), 1, "fortnights")'))
    ).toContain("unknown unit");
    expect(
      errorMessage(run('dateAdd(parseDate("2026-01-01"), "x", "days")'))
    ).toBe("dateAdd() expects a number, got text");
    expect(
      errorMessage(run('dateAdd(parseDate("2020-01-01"), 200000000, "days")'))
    ).toContain("out of range");
  });
});
