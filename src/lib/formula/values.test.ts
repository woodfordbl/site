import { describe, expect, it } from "vitest";

import type { FormulaNode } from "@/lib/formula/ast.ts";
import {
  BOOLEAN_TYPE,
  DATE_TYPE,
  lambdaTypeOf,
  listTypeOf,
  NUMBER_TYPE,
  rowTypeOf,
  TEXT_TYPE,
  TYPE_VARIABLE_T,
  UNKNOWN_TYPE,
  unionTypeOf,
} from "@/lib/formula/types.ts";
import {
  FORMULA_FIXED_NOW_ISO,
  FormulaDate,
  FormulaError,
  FormulaLambda,
  FormulaRowRef,
  type FormulaValue,
  formulaError,
  formulaScopeNow,
  formulaValueMatchesType,
  formulaValuesEqual,
  formulaValueTypeName,
  isFormulaError,
  LAMBDA_AS_VALUE_MESSAGE,
  requireBooleanValue,
  requireNumberValue,
} from "@/lib/formula/values.ts";

const LITERAL_ONE: FormulaNode = {
  kind: "literal",
  value: 1,
  position: 0,
  end: 1,
};

function lambdaOf(): FormulaLambda {
  return new FormulaLambda(["x"], LITERAL_ONE, null);
}

describe("FormulaDate", () => {
  it("defensively copies the wrapped Date", () => {
    const source = new Date(2026, 2, 5);
    const value = new FormulaDate(source, true);
    source.setFullYear(1999);
    expect(value.date.getFullYear()).toBe(2026);
  });

  it("exposes the instant as time", () => {
    const instant = new Date("2026-03-05T10:30:00.000Z");
    expect(new FormulaDate(instant, false).time).toBe(instant.getTime());
  });
});

describe("isFormulaError", () => {
  it("matches only FormulaError values", () => {
    expect(isFormulaError(formulaError("boom"))).toBe(true);
    expect(isFormulaError(new FormulaError("boom"))).toBe(true);
    expect(isFormulaError(null)).toBe(false);
    expect(isFormulaError(0)).toBe(false);
    expect(isFormulaError("")).toBe(false);
    expect(isFormulaError([])).toBe(false);
    expect(isFormulaError(new FormulaDate(new Date(), true))).toBe(false);
    expect(isFormulaError(new FormulaRowRef("db", "row"))).toBe(false);
    expect(isFormulaError(lambdaOf())).toBe(false);
  });
});

describe("formulaValueTypeName", () => {
  it("names every runtime kind (blank reads 'empty' like v1)", () => {
    expect(formulaValueTypeName(null)).toBe("empty");
    expect(formulaValueTypeName("x")).toBe("text");
    expect(formulaValueTypeName(1)).toBe("number");
    expect(formulaValueTypeName(true)).toBe("boolean");
    expect(formulaValueTypeName([1])).toBe("list");
    expect(formulaValueTypeName(new FormulaDate(new Date(), true))).toBe(
      "date"
    );
    expect(formulaValueTypeName(new FormulaRowRef("db", "row"))).toBe("row");
    expect(formulaValueTypeName(lambdaOf())).toBe("function");
    expect(formulaValueTypeName(formulaError("x"))).toBe("error");
  });
});

describe("formulaValuesEqual", () => {
  it("compares scalars type-aware", () => {
    expect(formulaValuesEqual(1, 1)).toBe(true);
    expect(formulaValuesEqual("a", "a")).toBe(true);
    expect(formulaValuesEqual(true, true)).toBe(true);
    expect(formulaValuesEqual(1, "1")).toBe(false);
    expect(formulaValuesEqual(true, 1)).toBe(false);
  });

  it("treats blank equal only to blank", () => {
    expect(formulaValuesEqual(null, null)).toBe(true);
    expect(formulaValuesEqual(null, 0)).toBe(false);
    expect(formulaValuesEqual("", null)).toBe(false);
  });

  it("compares lists element-wise and recursively", () => {
    expect(formulaValuesEqual([1, 2], [1, 2])).toBe(true);
    expect(formulaValuesEqual([1, 2], [2, 1])).toBe(false);
    expect(formulaValuesEqual([1], [1, 2])).toBe(false);
    expect(formulaValuesEqual([[1, null]], [[1, null]])).toBe(true);
    expect(formulaValuesEqual([1], 1)).toBe(false);
  });

  it("compares dates by instant, dateOnly ignored", () => {
    const instant = new Date("2026-03-05T00:00:00.000Z");
    expect(
      formulaValuesEqual(
        new FormulaDate(instant, true),
        new FormulaDate(instant, false)
      )
    ).toBe(true);
    expect(
      formulaValuesEqual(
        new FormulaDate(instant, true),
        new FormulaDate(new Date(instant.getTime() + 1), true)
      )
    ).toBe(false);
    expect(
      formulaValuesEqual(new FormulaDate(instant, true), "2026-03-05")
    ).toBe(false);
  });

  it("compares rows by database and row id", () => {
    expect(
      formulaValuesEqual(
        new FormulaRowRef("db1", "r1"),
        new FormulaRowRef("db1", "r1")
      )
    ).toBe(true);
    expect(
      formulaValuesEqual(
        new FormulaRowRef("db1", "r1"),
        new FormulaRowRef("db2", "r1")
      )
    ).toBe(false);
  });

  it("compares lambdas by reference", () => {
    const fn = lambdaOf();
    expect(formulaValuesEqual(fn, fn)).toBe(true);
    expect(formulaValuesEqual(fn, lambdaOf())).toBe(false);
  });
});

describe("require helpers", () => {
  it("requireNumberValue keeps v1 message shape and passes errors through", () => {
    expect(requireNumberValue(2, "min")).toBe(2);
    const error = requireNumberValue(null, "min");
    expect(error).toBeInstanceOf(FormulaError);
    expect((error as FormulaError).message).toBe(
      "min() expects a number, got empty"
    );
    const upstream = formulaError("boom");
    expect(requireNumberValue(upstream, "min")).toBe(upstream);
    expect(
      (requireNumberValue(lambdaOf(), "min") as FormulaError).message
    ).toBe(LAMBDA_AS_VALUE_MESSAGE);
  });

  it("requireBooleanValue keeps v1 message shape", () => {
    expect(requireBooleanValue(true, "if")).toBe(true);
    expect((requireBooleanValue(null, "if") as FormulaError).message).toBe(
      '"if" expects a boolean, got empty'
    );
    expect((requireBooleanValue(1, "and") as FormulaError).message).toBe(
      '"and" expects a boolean, got number'
    );
  });
});

describe("formulaScopeNow", () => {
  it("defaults to the fixed epoch for determinism", () => {
    expect(formulaScopeNow({ getProperty: () => null }).toISOString()).toBe(
      FORMULA_FIXED_NOW_ISO
    );
  });

  it("reads the injected clock", () => {
    const instant = new Date("2026-07-04T08:30:00.000Z");
    expect(
      formulaScopeNow({ getProperty: () => null, now: () => instant }).getTime()
    ).toBe(instant.getTime());
  });
});

describe("formulaValueMatchesType", () => {
  const date = new FormulaDate(new Date(), true);
  const row = new FormulaRowRef("db", "row");

  it("checks top-level shape per kind", () => {
    expect(formulaValueMatchesType(1, NUMBER_TYPE)).toBe(true);
    expect(formulaValueMatchesType("1", NUMBER_TYPE)).toBe(false);
    expect(formulaValueMatchesType("x", TEXT_TYPE)).toBe(true);
    expect(formulaValueMatchesType(true, BOOLEAN_TYPE)).toBe(true);
    expect(formulaValueMatchesType(date, DATE_TYPE)).toBe(true);
    expect(formulaValueMatchesType("2026-01-01", DATE_TYPE)).toBe(false);
    expect(formulaValueMatchesType(row, rowTypeOf("db"))).toBe(true);
    expect(
      formulaValueMatchesType(lambdaOf(), lambdaTypeOf([], NUMBER_TYPE))
    ).toBe(true);
  });

  it("checks lists top-level only (elements are the implementation's job)", () => {
    const numbers = listTypeOf(NUMBER_TYPE);
    expect(formulaValueMatchesType([1, "x"], numbers)).toBe(true);
    expect(formulaValueMatchesType("x", numbers)).toBe(false);
  });

  it("rejects blank for non-blank types and accepts it for blank/unknown", () => {
    expect(formulaValueMatchesType(null, NUMBER_TYPE)).toBe(false);
    expect(formulaValueMatchesType(null, { kind: "blank" })).toBe(true);
    expect(formulaValueMatchesType(null, UNKNOWN_TYPE)).toBe(true);
    expect(formulaValueMatchesType(null, TYPE_VARIABLE_T)).toBe(true);
  });

  it("accepts any member of a union", () => {
    const numberOrList = unionTypeOf(NUMBER_TYPE, listTypeOf(NUMBER_TYPE));
    expect(formulaValueMatchesType(1, numberOrList)).toBe(true);
    expect(formulaValueMatchesType([1], numberOrList)).toBe(true);
    expect(formulaValueMatchesType("x", numberOrList)).toBe(false);
  });

  it("keeps FormulaValue arrays assignable (smoke)", () => {
    const list: FormulaValue = [1, "a", null, [true]];
    expect(Array.isArray(list)).toBe(true);
  });
});
