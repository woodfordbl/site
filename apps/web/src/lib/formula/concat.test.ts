/**
 * @fileoverview The `&` text-concatenation operator, checked and evaluated.
 *
 * `&` has spreadsheet semantics rather than `+`'s: every value with a text
 * form coerces (numbers, booleans, dates), blank reads as the empty string,
 * and only values with no text form — lists and rows — are rejected. Both
 * halves of that contract live here so the checker's types and the
 * evaluator's results cannot drift apart. `<>` (the spreadsheet spelling of
 * `!=`) rides along, since it arrived with the same grammar change.
 */
import { describe, expect, it } from "vitest";

import { checkFormula, type FormulaCheckResult } from "@/lib/formula/check.ts";
import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import { TEXT_TYPE } from "@/lib/formula/types.ts";
import {
  type FormulaScope,
  type FormulaValue,
  formulaError,
  isFormulaError,
} from "@/lib/formula/values.ts";

const EMPTY_SCOPE: FormulaScope = {
  getProperty: (name) => formulaError(`Unknown property "${name}"`),
};

function astOf(source: string) {
  const parsed = parseFormula(source);
  if (!parsed.ok) {
    throw new Error(
      `parse failed for ${JSON.stringify(source)}: ${parsed.error.message}`
    );
  }
  return parsed.ast;
}

function run(source: string): FormulaValue {
  return evaluateFormula(astOf(source), EMPTY_SCOPE);
}

function errorMessage(value: FormulaValue): string {
  if (!isFormulaError(value)) {
    throw new Error(`expected a FormulaError, got ${JSON.stringify(value)}`);
  }
  return value.message;
}

function resultOf(source: string): FormulaCheckResult {
  return checkFormula(astOf(source), { properties: [] });
}

/** Result type of a formula asserted (by throw) to check completely clean. */
function typeOf(source: string) {
  const result = resultOf(source);
  if (result.diagnostics.length > 0) {
    throw new Error(
      `expected no diagnostics for ${JSON.stringify(source)}, got: ${result.diagnostics[0].message}`
    );
  }
  return result.resultType;
}

function soleDiagnostic(source: string) {
  const result = resultOf(source);
  if (result.diagnostics.length !== 1) {
    throw new Error(
      `expected exactly one diagnostic for ${JSON.stringify(source)}, got ${result.diagnostics.length}`
    );
  }
  return result.diagnostics[0];
}

describe("text concatenation (&) — checking", () => {
  it("types & as text over every coercible operand, blank included", () => {
    expect(typeOf('"a" & "b"')).toEqual(TEXT_TYPE);
    expect(typeOf('"total: " & 1')).toEqual(TEXT_TYPE);
    expect(typeOf("1 & 2")).toEqual(TEXT_TYPE);
    expect(typeOf('null & "x"')).toEqual(TEXT_TYPE);
    expect(typeOf('now() & ""')).toEqual(TEXT_TYPE);
  });

  it("diagnoses & operands with no text form, at the operator", () => {
    expect(soleDiagnostic('[1] & "x"')).toEqual({
      end: 5,
      message: "Cannot convert list of numbers to text",
      severity: "error",
      start: 4,
    });
  });
});

describe("text concatenation (&)", () => {
  it("joins values as text with spreadsheet coercion", () => {
    expect(run('"a" & "b"')).toBe("ab");
    expect(run('"total: " & 3')).toBe("total: 3");
    expect(run("1 & 2")).toBe("12");
    expect(run('"done: " & true')).toBe("done: true");
  });

  it("treats blank as the empty string, unlike +", () => {
    expect(run('null & "x"')).toBe("x");
    expect(run('"x" & null')).toBe("x");
    expect(errorMessage(run('null + "x"'))).toContain("Cannot add");
  });

  it("propagates errors and rejects listy operands", () => {
    expect(errorMessage(run('(1 / 0) & "x"'))).toBe("Division by zero");
    expect(errorMessage(run('[1, 2] & "x"'))).toBe(
      "Cannot convert a list to text"
    );
  });

  it("evaluates <> as not-equal", () => {
    expect(run("1 <> 2")).toBe(true);
    expect(run('"a" <> "a"')).toBe(false);
  });
});
