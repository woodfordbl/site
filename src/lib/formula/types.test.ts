import { describe, expect, it } from "vitest";

import {
  BLANK_TYPE,
  BOOLEAN_TYPE,
  DATE_TYPE,
  ERROR_TYPE,
  formulaTypeExpectedPhrase,
  formulaTypeName,
  formulaTypesEqual,
  lambdaTypeOf,
  listTypeOf,
  NUMBER_TYPE,
  rowTypeOf,
  TEXT_TYPE,
  TYPE_VARIABLE_T,
  UNKNOWN_TYPE,
  unionTypeOf,
} from "@/lib/formula/types.ts";

describe("formulaTypeName", () => {
  it("names scalar types", () => {
    expect(formulaTypeName(NUMBER_TYPE)).toBe("number");
    expect(formulaTypeName(TEXT_TYPE)).toBe("text");
    expect(formulaTypeName(BOOLEAN_TYPE)).toBe("boolean");
    expect(formulaTypeName(DATE_TYPE)).toBe("date");
    expect(formulaTypeName(BLANK_TYPE)).toBe("blank");
    expect(formulaTypeName(UNKNOWN_TYPE)).toBe("unknown");
    expect(formulaTypeName(ERROR_TYPE)).toBe("error");
  });

  it("pluralizes list elements", () => {
    expect(formulaTypeName(listTypeOf(NUMBER_TYPE))).toBe("list of numbers");
    expect(formulaTypeName(listTypeOf(TEXT_TYPE))).toBe("list of text");
    expect(formulaTypeName(listTypeOf(listTypeOf(NUMBER_TYPE)))).toBe(
      "list of lists of numbers"
    );
  });

  it("names rows, lambdas, unions, and type variables", () => {
    expect(formulaTypeName(rowTypeOf())).toBe("row");
    expect(formulaTypeName(lambdaTypeOf([NUMBER_TYPE], NUMBER_TYPE))).toBe(
      "function"
    );
    expect(formulaTypeName(unionTypeOf(NUMBER_TYPE, TEXT_TYPE))).toBe(
      "number or text"
    );
    expect(formulaTypeName(TYPE_VARIABLE_T)).toBe("T");
  });
});

describe("formulaTypeExpectedPhrase", () => {
  it("includes the article v1 messages used", () => {
    expect(formulaTypeExpectedPhrase(NUMBER_TYPE)).toBe("a number");
    expect(formulaTypeExpectedPhrase(TEXT_TYPE)).toBe("text");
    expect(formulaTypeExpectedPhrase(BOOLEAN_TYPE)).toBe("a boolean");
    expect(formulaTypeExpectedPhrase(DATE_TYPE)).toBe("a date");
    expect(formulaTypeExpectedPhrase(listTypeOf(NUMBER_TYPE))).toBe(
      "a list of numbers"
    );
    expect(
      formulaTypeExpectedPhrase(lambdaTypeOf([TYPE_VARIABLE_T], BOOLEAN_TYPE))
    ).toBe("a function");
    expect(
      formulaTypeExpectedPhrase(
        unionTypeOf(NUMBER_TYPE, listTypeOf(NUMBER_TYPE))
      )
    ).toBe("a number or a list of numbers");
  });
});

describe("formulaTypesEqual", () => {
  it("compares simple kinds by tag", () => {
    expect(formulaTypesEqual(NUMBER_TYPE, { kind: "number" })).toBe(true);
    expect(formulaTypesEqual(NUMBER_TYPE, TEXT_TYPE)).toBe(false);
  });

  it("compares structured kinds structurally", () => {
    expect(
      formulaTypesEqual(listTypeOf(NUMBER_TYPE), listTypeOf(NUMBER_TYPE))
    ).toBe(true);
    expect(
      formulaTypesEqual(listTypeOf(NUMBER_TYPE), listTypeOf(TEXT_TYPE))
    ).toBe(false);
    expect(formulaTypesEqual(rowTypeOf("db1"), rowTypeOf("db1"))).toBe(true);
    expect(formulaTypesEqual(rowTypeOf("db1"), rowTypeOf("db2"))).toBe(false);
    expect(formulaTypesEqual(rowTypeOf(), rowTypeOf())).toBe(true);
    expect(
      formulaTypesEqual(
        lambdaTypeOf([NUMBER_TYPE], TEXT_TYPE),
        lambdaTypeOf([NUMBER_TYPE], TEXT_TYPE)
      )
    ).toBe(true);
    expect(
      formulaTypesEqual(
        lambdaTypeOf([NUMBER_TYPE], TEXT_TYPE),
        lambdaTypeOf([TEXT_TYPE], TEXT_TYPE)
      )
    ).toBe(false);
  });

  it("compares unions as sets", () => {
    expect(
      formulaTypesEqual(
        unionTypeOf(NUMBER_TYPE, TEXT_TYPE),
        unionTypeOf(TEXT_TYPE, NUMBER_TYPE)
      )
    ).toBe(true);
    expect(
      formulaTypesEqual(
        unionTypeOf(NUMBER_TYPE, TEXT_TYPE),
        unionTypeOf(NUMBER_TYPE, BOOLEAN_TYPE)
      )
    ).toBe(false);
  });

  it("compares type variables by name", () => {
    expect(
      formulaTypesEqual(TYPE_VARIABLE_T, { kind: "typevar", name: "T" })
    ).toBe(true);
    expect(
      formulaTypesEqual(TYPE_VARIABLE_T, { kind: "typevar", name: "U" })
    ).toBe(false);
  });
});

describe("unionTypeOf", () => {
  it("flattens nested unions and dedupes members", () => {
    const union = unionTypeOf(NUMBER_TYPE, unionTypeOf(TEXT_TYPE, NUMBER_TYPE));
    expect(union).toEqual(unionTypeOf(NUMBER_TYPE, TEXT_TYPE));
  });

  it("collapses a single member to itself", () => {
    expect(unionTypeOf(NUMBER_TYPE, NUMBER_TYPE)).toBe(NUMBER_TYPE);
  });

  it("absorbs unknown", () => {
    expect(unionTypeOf(NUMBER_TYPE, UNKNOWN_TYPE)).toBe(UNKNOWN_TYPE);
  });

  it("collapses oversized unions to unknown", () => {
    expect(
      unionTypeOf(NUMBER_TYPE, TEXT_TYPE, BOOLEAN_TYPE, DATE_TYPE, BLANK_TYPE)
    ).toBe(UNKNOWN_TYPE);
  });

  it("returns unknown for an empty union", () => {
    expect(unionTypeOf()).toBe(UNKNOWN_TYPE);
  });
});
