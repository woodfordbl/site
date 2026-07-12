import { describe, expect, it } from "vitest";

import {
  FORMULA_FUNCTION_CATALOG,
  formulaFunctionForName,
} from "@/lib/formula/catalog.ts";
import {
  checkFormula,
  type FormulaCheckContext,
  type FormulaCheckProperty,
  type FormulaCheckResult,
  formulaPropertyValueType,
  formulaTypeBadge,
} from "@/lib/formula/check.ts";
import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import {
  BLANK_TYPE,
  BOOLEAN_TYPE,
  DATE_TYPE,
  ERROR_TYPE,
  type FormulaType,
  formulaTypesEqual,
  lambdaTypeOf,
  listTypeOf,
  NUMBER_TYPE,
  rowTypeOf,
  TEXT_TYPE,
  UNKNOWN_TYPE,
  unionTypeOf,
} from "@/lib/formula/types.ts";
import {
  type FormulaScope,
  isFormulaError,
  LAMBDA_AS_VALUE_MESSAGE,
} from "@/lib/formula/values.ts";

const BLANK_SCOPE: FormulaScope = { getProperty: () => null };

/** One field of every kind, exercising the full cell-type mapping. */
const SCHEMA: FormulaCheckProperty[] = [
  { id: "f_title", kind: "text", name: "Title", type: UNKNOWN_TYPE },
  { id: "f_link", kind: "url", name: "Link", type: UNKNOWN_TYPE },
  { id: "f_est", kind: "number", name: "Estimate", type: UNKNOWN_TYPE },
  { id: "f_done", kind: "checkbox", name: "Done", type: UNKNOWN_TYPE },
  { id: "f_due", kind: "date", name: "Due", type: UNKNOWN_TYPE },
  { id: "f_status", kind: "select", name: "Status", type: UNKNOWN_TYPE },
  { id: "f_tags", kind: "multiSelect", name: "Tags", type: UNKNOWN_TYPE },
  { id: "f_total", kind: "formula", name: "Total", type: NUMBER_TYPE },
  { id: "f_calc", kind: "formula", name: "Calc", type: UNKNOWN_TYPE },
];

function resultOf(
  source: string,
  properties: FormulaCheckProperty[] = []
): FormulaCheckResult {
  const parsed = parseFormula(source);
  if (!parsed.ok) {
    throw new Error(
      `parse failed for ${JSON.stringify(source)}: ${parsed.error.message}`
    );
  }
  return checkFormula(parsed.ast, { properties });
}

/** Result type of a formula asserted (by throw) to check completely clean. */
function typeOf(
  source: string,
  properties: FormulaCheckProperty[] = []
): FormulaType {
  const result = resultOf(source, properties);
  if (result.diagnostics.length > 0) {
    throw new Error(
      `expected no diagnostics for ${JSON.stringify(source)}, got: ${result.diagnostics[0].message}`
    );
  }
  return result.resultType;
}

function soleDiagnostic(
  source: string,
  properties: FormulaCheckProperty[] = []
) {
  const result = resultOf(source, properties);
  if (result.diagnostics.length !== 1) {
    throw new Error(
      `expected exactly one diagnostic for ${JSON.stringify(source)}, got ${result.diagnostics.length}`
    );
  }
  return result.diagnostics[0];
}

function expectTypesEqual(actual: FormulaType, expected: FormulaType): void {
  if (!formulaTypesEqual(actual, expected)) {
    throw new Error(
      `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`
    );
  }
}

describe("literal and list types", () => {
  it("types literals", () => {
    expect(typeOf("42")).toEqual(NUMBER_TYPE);
    expect(typeOf('"hi"')).toEqual(TEXT_TYPE);
    expect(typeOf("true")).toEqual(BOOLEAN_TYPE);
    expect(typeOf("null")).toEqual(BLANK_TYPE);
  });

  it("types list literals from their items", () => {
    expect(typeOf("[1, 2]")).toEqual(listTypeOf(NUMBER_TYPE));
    expect(typeOf("[]")).toEqual(listTypeOf(UNKNOWN_TYPE));
    expectTypesEqual(
      typeOf('[1, "a"]'),
      listTypeOf(unionTypeOf(NUMBER_TYPE, TEXT_TYPE))
    );
  });
});

describe("property typing", () => {
  it("maps every field kind to its cell type", () => {
    expect(typeOf("thisPage.Title", SCHEMA)).toEqual(TEXT_TYPE);
    expect(typeOf("thisPage.Link", SCHEMA)).toEqual(TEXT_TYPE);
    expect(typeOf("thisPage.Estimate", SCHEMA)).toEqual(NUMBER_TYPE);
    expect(typeOf("thisPage.Done", SCHEMA)).toEqual(BOOLEAN_TYPE);
    expect(typeOf("thisPage.Due", SCHEMA)).toEqual(DATE_TYPE);
    expect(typeOf("thisPage.Status", SCHEMA)).toEqual(TEXT_TYPE);
    expect(typeOf("thisPage.Tags", SCHEMA)).toEqual(listTypeOf(TEXT_TYPE));
    expect(typeOf("thisPage.Total", SCHEMA)).toEqual(NUMBER_TYPE);
    expect(typeOf("thisPage.Calc", SCHEMA)).toEqual(UNKNOWN_TYPE);
  });

  it("types canonical prop() and bracket references identically", () => {
    expect(typeOf('prop("f_est")', SCHEMA)).toEqual(NUMBER_TYPE);
    expect(typeOf('thisPage["Estimate"]', SCHEMA)).toEqual(NUMBER_TYPE);
    expect(typeOf('thisRow["Tags"]', SCHEMA)).toEqual(listTypeOf(TEXT_TYPE));
  });

  it("types property refs as plain T, never T | blank", () => {
    // Blankness is a runtime concern; static composition stays clean.
    expect(typeOf("thisPage.Estimate * 2", SCHEMA)).toEqual(NUMBER_TYPE);
    expect(typeOf("thisPage.Total * 2", SCHEMA)).toEqual(NUMBER_TYPE);
  });

  it("resolves scope refs by field id first, like evaluation", () => {
    const result = resultOf("thisPage.f_est", SCHEMA);
    expect(result.diagnostics).toEqual([]);
    expect(result.resultType).toEqual(NUMBER_TYPE);
    expect(result.references).toEqual(["f_est"]);
  });

  it("exposes the mapping directly for the evaluator's row scope", () => {
    const type = (kind: FormulaCheckProperty["kind"]) =>
      formulaPropertyValueType({ kind, type: UNKNOWN_TYPE });
    expect(type("text")).toEqual(TEXT_TYPE);
    expect(type("url")).toEqual(TEXT_TYPE);
    expect(type("select")).toEqual(TEXT_TYPE);
    expect(type("number")).toEqual(NUMBER_TYPE);
    expect(type("checkbox")).toEqual(BOOLEAN_TYPE);
    expect(type("date")).toEqual(DATE_TYPE);
    expect(type("multiSelect")).toEqual(listTypeOf(TEXT_TYPE));
    expect(
      formulaPropertyValueType({ kind: "formula", type: DATE_TYPE })
    ).toEqual(DATE_TYPE);
  });
});

describe("operators", () => {
  it("types arithmetic, power, and comparisons", () => {
    expect(typeOf("1 + 2")).toEqual(NUMBER_TYPE);
    expect(typeOf("2 ^ 10")).toEqual(NUMBER_TYPE);
    expect(typeOf("7 % 3")).toEqual(NUMBER_TYPE);
    expect(typeOf("-2")).toEqual(NUMBER_TYPE);
    expect(typeOf("1 < 2")).toEqual(BOOLEAN_TYPE);
    expect(typeOf('"a" < "b"')).toEqual(BOOLEAN_TYPE);
    expect(typeOf("now() < today()")).toEqual(BOOLEAN_TYPE);
    expect(typeOf("not true")).toEqual(BOOLEAN_TYPE);
    expect(typeOf("true and false or true")).toEqual(BOOLEAN_TYPE);
  });

  it("mirrors the runtime + overload: text when either side is text", () => {
    expect(typeOf('"a" + "b"')).toEqual(TEXT_TYPE);
    expect(typeOf('"a" + 1')).toEqual(TEXT_TYPE);
    expect(typeOf('1 + "a"')).toEqual(TEXT_TYPE);
    expect(typeOf('"is " + true')).toEqual(TEXT_TYPE);
    expect(typeOf('"due " + now()')).toEqual(TEXT_TYPE);
    expect(typeOf("thisPage.Title + thisPage.Estimate", SCHEMA)).toEqual(
      TEXT_TYPE
    );
  });

  it("treats == and != as any-vs-any booleans", () => {
    expect(typeOf('1 == "a"')).toEqual(BOOLEAN_TYPE);
    expect(typeOf("[1] != now()")).toEqual(BOOLEAN_TYPE);
  });

  it("types ?? as the union of both sides, no blank check on the left", () => {
    expect(typeOf("1 ?? 2")).toEqual(NUMBER_TYPE);
    expectTypesEqual(typeOf('1 ?? "x"'), unionTypeOf(NUMBER_TYPE, TEXT_TYPE));
    expectTypesEqual(
      typeOf('parseDate("2026-01-01") ?? "none"'),
      unionTypeOf(DATE_TYPE, BLANK_TYPE, TEXT_TYPE)
    );
  });

  it("diagnoses arithmetic operand mistakes at the operator", () => {
    expect(soleDiagnostic('1 - "a"')).toEqual({
      end: 3,
      message: 'Cannot apply "-" to number and text',
      severity: "error",
      start: 2,
    });
    expect(soleDiagnostic("2 ^ true")).toEqual({
      end: 3,
      message: 'Cannot apply "^" to number and boolean',
      severity: "error",
      start: 2,
    });
  });

  it("diagnoses + with no valid overload", () => {
    expect(soleDiagnostic("null + 1")).toEqual({
      end: 6,
      message: "Cannot add blank and number",
      severity: "error",
      start: 5,
    });
    expect(soleDiagnostic('"x" + null')).toEqual({
      end: 5,
      message: "Cannot add text and blank",
      severity: "error",
      start: 4,
    });
    expect(soleDiagnostic('[1] + "x"').message).toBe(
      "Cannot add list of numbers and text"
    );
    expect(typeOf("1 + 2 == 3")).toEqual(BOOLEAN_TYPE);
  });

  it("requires one shared orderable type for comparisons", () => {
    expect(soleDiagnostic('"a" < 1')).toEqual({
      end: 5,
      message: "Cannot compare text and number",
      severity: "error",
      start: 4,
    });
    expect(soleDiagnostic("true < false").message).toBe(
      "Cannot compare boolean and boolean"
    );
  });

  it("diagnoses logical operands at the operator", () => {
    expect(soleDiagnostic("true and 1")).toEqual({
      end: 8,
      message: '"and" expects a boolean, got number',
      severity: "error",
      start: 5,
    });
    expect(soleDiagnostic("1 or true").message).toBe(
      '"or" expects a boolean, got number'
    );
  });

  it("diagnoses unary operands at the operand span", () => {
    expect(soleDiagnostic('-"a"')).toEqual({
      end: 4,
      message: "Cannot negate text",
      severity: "error",
      start: 1,
    });
    expect(soleDiagnostic("not 1")).toEqual({
      end: 5,
      message: '"not" expects a boolean, got number',
      severity: "error",
      start: 4,
    });
  });
});

describe("function calls", () => {
  it("diagnoses unknown functions with a nearby suggestion", () => {
    expect(soleDiagnostic("lenght([1, 2])")).toEqual({
      end: 14,
      message: 'Unknown function "lenght" — did you mean "length"?',
      severity: "error",
      start: 0,
    });
    expect(soleDiagnostic("rond(1.5)").message).toBe(
      'Unknown function "rond" — did you mean "round"?'
    );
    // A typed prefix counts as a near-match even past edit distance 2.
    expect(soleDiagnostic('formatDa(now(), "y")').message).toBe(
      'Unknown function "formatDa" — did you mean "formatDate"?'
    );
    expect(soleDiagnostic("zzzzz(1)").message).toBe('Unknown function "zzzzz"');
  });

  it("still collects references inside a broken call", () => {
    const result = resultOf("zzzzz(thisPage.Estimate)", SCHEMA);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.references).toEqual(["f_est"]);
  });

  it("reuses the catalog arity phrasing with the call span", () => {
    expect(soleDiagnostic("abs(1, 2)")).toEqual({
      end: 9,
      message: "abs() expects 1 argument, got 2",
      severity: "error",
      start: 0,
    });
    expect(soleDiagnostic("and(true)").message).toBe(
      "and() expects at least 2 argument(s), got 1"
    );
    expect(soleDiagnostic("switch(1, 2)").message).toBe(
      "switch() expects at least 3 argument(s), got 2"
    );
    // Alias spelling is preserved in the message.
    expect(soleDiagnostic("avg()").message).toBe(
      "avg() expects at least 1 argument(s), got 0"
    );
  });

  it("diagnoses argument type mismatches at the argument span", () => {
    expect(soleDiagnostic('abs("x")')).toEqual({
      end: 7,
      message: "abs() expects a number, got text",
      severity: "error",
      start: 4,
    });
    expect(soleDiagnostic("abs(null)").message).toBe(
      "abs() expects a number, got blank"
    );
    expect(soleDiagnostic('min("a")').message).toBe(
      "min() expects a number or a list of numbers, got text"
    );
  });

  it("accepts unions optimistically when any member fits", () => {
    expect(typeOf('formatDate(parseDate("2026-03-05"), "MMM d")')).toEqual(
      TEXT_TYPE
    );
    expect(typeOf('abs(if(true, 1, "a"))')).toEqual(NUMBER_TYPE);
    expect(typeOf('year(parseDate("2026-03-05"))')).toEqual(NUMBER_TYPE);
  });

  it("accepts unknown everywhere", () => {
    expect(typeOf("abs(thisPage.Calc)", SCHEMA)).toEqual(NUMBER_TYPE);
    expect(typeOf("upper(thisPage.Calc)", SCHEMA)).toEqual(TEXT_TYPE);
    expect(typeOf("map(thisPage.Calc, x => x)", SCHEMA)).toEqual(
      listTypeOf(UNKNOWN_TYPE)
    );
  });

  it("accepts the runtime-coercible types on lenient text params silently", () => {
    expect(typeOf("len(1)")).toEqual(NUMBER_TYPE);
    expect(typeOf("len(true)")).toEqual(NUMBER_TYPE);
    expect(typeOf("len(null)")).toEqual(NUMBER_TYPE);
    expect(typeOf("len(now())")).toEqual(NUMBER_TYPE);
    expect(typeOf("join([1, 2], 3)")).toEqual(TEXT_TYPE);
    expect(soleDiagnostic("trim([1])")).toEqual({
      end: 8,
      message: "trim() expects text, got list of numbers",
      severity: "error",
      start: 5,
    });
  });

  it("enforces a bound type variable across arguments", () => {
    expect(soleDiagnostic('includes([1, 2], "a")')).toEqual({
      end: 20,
      message: "includes() expects a number, got text",
      severity: "error",
      start: 17,
    });
    expect(typeOf("includes([1, 2], 2)")).toEqual(BOOLEAN_TYPE);
  });

  it("does not cascade: a diagnosed node synthesizes unknown", () => {
    const one = resultOf("upper([1]) + 1");
    expect(one.diagnostics).toHaveLength(1);
    expect(one.resultType).toEqual(UNKNOWN_TYPE);
    // The diagnosed abs() call synthesizes unknown, which * accepts — the
    // one mistake stays one diagnostic and the result is still a number.
    const two = resultOf('abs("x") * 2');
    expect(two.diagnostics).toHaveLength(1);
    expect(two.resultType).toEqual(NUMBER_TYPE);
  });
});

describe("higher-order functions and lambdas", () => {
  it("infers through map, filter, find, sort, and flat", () => {
    expect(typeOf("map([1, 2], x => x + 1)")).toEqual(listTypeOf(NUMBER_TYPE));
    expect(typeOf("map([1, 2], (x, i) => i)")).toEqual(listTypeOf(NUMBER_TYPE));
    expect(typeOf("filter([1, 2, 3, 4], x => x > 2)")).toEqual(
      listTypeOf(NUMBER_TYPE)
    );
    expect(typeOf("find([1, 2], x => x > 1)")).toEqual(NUMBER_TYPE);
    expect(typeOf('findIndex(["a", "b"], x => x == "b")')).toEqual(NUMBER_TYPE);
    expect(typeOf('sort(["bb", "a"], x => len(x))')).toEqual(
      listTypeOf(TEXT_TYPE)
    );
    expect(typeOf("sort([3, 1, 2])")).toEqual(listTypeOf(NUMBER_TYPE));
    expect(typeOf("flat([[1], [2, 3]])")).toEqual(listTypeOf(NUMBER_TYPE));
    expect(typeOf('at(["a", "b"], 1)')).toEqual(TEXT_TYPE);
    expect(typeOf("first([true])")).toEqual(BOOLEAN_TYPE);
  });

  it("infers through nested HOF chains", () => {
    expect(typeOf('[1, 2].map(x => format(x)).join(", ")')).toEqual(TEXT_TYPE);
    expect(typeOf("map([1, 2], x => x + 1).sum()")).toEqual(NUMBER_TYPE);
    expect(
      typeOf("map(thisPage.Tags, t => t + thisPage.Title)", SCHEMA)
    ).toEqual(listTypeOf(TEXT_TYPE));
  });

  it("diagnoses a lambda naming more params than the function provides", () => {
    const source = "map([1], (a, b, c) => a)";
    expect(soleDiagnostic(source)).toEqual({
      end: source.length - 1,
      message: "The function names 3 parameters, but map() provides only 2",
      severity: "error",
      start: source.indexOf("(a"),
    });
    expect(soleDiagnostic("sort([1, 2], (a, b) => a)").message).toBe(
      "The function names 2 parameters, but sort() provides only 1"
    );
    // Fewer parameters than supplied is fine.
    expect(typeOf("map([1], x => 0)")).toEqual(listTypeOf(NUMBER_TYPE));
  });

  it("checks a predicate lambda's return type against the signature", () => {
    expect(soleDiagnostic("filter([1, 2], x => x + 1)")).toEqual({
      end: 25,
      message:
        "filter() expects the test function to return a boolean, got number",
      severity: "error",
      start: 20,
    });
    expect(typeOf("every([1, 2], x => x > 0)")).toEqual(BOOLEAN_TYPE);
  });

  it("diagnoses a non-lambda where a function is expected", () => {
    expect(soleDiagnostic("map([1, 2], 5)")).toEqual({
      end: 13,
      message: "map() expects a function, got number",
      severity: "error",
      start: 12,
    });
  });

  it("diagnoses lambdas outside lambda-expecting argument positions", () => {
    const expected =
      "A function like x => … can only be used as an argument of map, filter, find, findIndex, some, every, or sort";
    expect(soleDiagnostic("1 + (x => x)")).toEqual({
      end: 11,
      message: expected,
      severity: "error",
      start: 5,
    });
    expect(soleDiagnostic("abs(x => x)")).toEqual({
      end: 10,
      message: expected,
      severity: "error",
      start: 4,
    });
    const inList = resultOf("[x => x]");
    expect(inList.diagnostics).toHaveLength(1);
    expect(inList.diagnostics[0].message).toBe(expected);
    expect(inList.resultType).toEqual(listTypeOf(UNKNOWN_TYPE));
  });
});

describe("method-call form", () => {
  const PAIRS: [string, string][] = [
    ["map([1, 2], x => x * 2)", "[1, 2].map(x => x * 2)"],
    [
      'join(map([1, 2], x => format(x)), ", ")',
      '[1, 2].map(x => format(x)).join(", ")',
    ],
    ['split("a,b", ",")', '"a,b".split(",")'],
    ["upper([1])", "[1].upper()"],
  ];

  it("types and diagnoses identically to the call form", () => {
    for (const [callForm, methodForm] of PAIRS) {
      const a = resultOf(callForm);
      const b = resultOf(methodForm);
      expectTypesEqual(a.resultType, b.resultType);
      expect(
        a.diagnostics.map((diagnostic) => diagnostic.message),
        callForm
      ).toEqual(b.diagnostics.map((diagnostic) => diagnostic.message));
    }
  });
});

describe("let and lets", () => {
  it("types bodies with bindings in scope", () => {
    expect(typeOf("let(x, 2, x * 3)")).toEqual(NUMBER_TYPE);
    expect(typeOf("lets(a, 1, b, a + 1, b * 2)")).toEqual(NUMBER_TYPE);
    expect(typeOf('let(x, "a", upper(x))')).toEqual(TEXT_TYPE);
  });

  it("shadows outer bindings and catalog names", () => {
    expect(typeOf('let(x, 1, let(x, "a", x))')).toEqual(TEXT_TYPE);
    expect(typeOf("let(round, 5, round + 1)")).toEqual(NUMBER_TYPE);
  });

  it("validates let's shape with positioned diagnostics", () => {
    expect(soleDiagnostic("let(x, 1)")).toEqual({
      end: 9,
      message: "let() expects 3 arguments, got 2",
      severity: "error",
      start: 0,
    });
    expect(soleDiagnostic("let(1, 2, 3)")).toEqual({
      end: 5,
      message: "let() expects a name as argument 1, like let(x, 1, x + 1)",
      severity: "error",
      start: 4,
    });
  });

  it("validates lets' shape with positioned diagnostics", () => {
    expect(soleDiagnostic("lets(a, 1)")).toEqual({
      end: 10,
      message: "lets() expects at least 3 arguments, got 2",
      severity: "error",
      start: 0,
    });
    expect(soleDiagnostic("lets(a, 1, 2, 3)")).toEqual({
      end: 16,
      message:
        "lets() expects name/value pairs followed by one result, got 4 arguments",
      severity: "error",
      start: 0,
    });
    expect(soleDiagnostic("lets(a, 1, 2, 3, 4)")).toEqual({
      end: 12,
      message:
        "lets() expects a name as argument 3, like lets(a, 1, b, a + 1, b * 2)",
      severity: "error",
      start: 11,
    });
  });

  it("diagnoses calling a non-function binding", () => {
    expect(soleDiagnostic("let(f, 1, f(2))")).toEqual({
      end: 14,
      message: '"f" is not a function',
      severity: "error",
      start: 10,
    });
  });
});

describe("let-bound lambdas", () => {
  it("checks a bound lambda call clean, typing the synthesized return", () => {
    expect(typeOf("let(f, x => x + 1, f(2))")).toEqual(UNKNOWN_TYPE);
    expect(typeOf("let(f, x => x > 0, f(2))")).toEqual(BOOLEAN_TYPE);
    expect(typeOf("lets(f, x => x + 1, y, f(2), y * 2)")).toEqual(NUMBER_TYPE);
    expect(typeOf("let(f, x => x + 1, let(g, f, g(2)))")).toEqual(UNKNOWN_TYPE);
  });

  it("mirrors runtime arity: extra arguments fine, missing ones error", () => {
    expect(typeOf("let(f, x => x, f(1, 2))")).toEqual(UNKNOWN_TYPE);
    const source = "let(f, (a, b) => a + b, f(1))";
    expect(soleDiagnostic(source)).toEqual({
      end: source.indexOf("f(1)") + 4,
      message:
        "The lambda names 2 parameters, but only 1 value(s) are provided here",
      severity: "error",
      start: source.indexOf("f(1)"),
    });
  });

  it("accepts a bound lambda as a HOF argument, like the runtime", () => {
    expect(typeOf("let(f, x => x + 1, map([1, 2], f))")).toEqual(
      listTypeOf(UNKNOWN_TYPE)
    );
    expect(typeOf("let(f, x => x > 1, filter([1, 2], f))")).toEqual(
      listTypeOf(NUMBER_TYPE)
    );
  });

  it("checks a bound lambda HOF argument's arity and return type", () => {
    const arity = "let(f, (a, b, c) => a, map([1, 2], f))";
    expect(soleDiagnostic(arity)).toEqual({
      end: arity.lastIndexOf("f") + 1,
      message: "The function names 3 parameters, but map() provides only 2",
      severity: "error",
      start: arity.lastIndexOf("f"),
    });
    const returns = "let(f, x => 1, filter([1, 2], f))";
    expect(soleDiagnostic(returns)).toEqual({
      end: returns.lastIndexOf("f") + 1,
      message:
        "filter() expects the test function to return a boolean, got number",
      severity: "error",
      start: returns.lastIndexOf("f"),
    });
  });

  it("diagnoses a bound lambda used as a value, mirroring the runtime", () => {
    expect(soleDiagnostic("let(f, x => x, 1 + f)")).toEqual({
      end: 18,
      message: LAMBDA_AS_VALUE_MESSAGE,
      severity: "error",
      start: 17,
    });
    expect(soleDiagnostic("let(f, x => x, -f)")).toEqual({
      end: 17,
      message: LAMBDA_AS_VALUE_MESSAGE,
      severity: "error",
      start: 16,
    });
    expect(soleDiagnostic("let(f, x => x, f == 1)").message).toBe(
      LAMBDA_AS_VALUE_MESSAGE
    );
    expect(soleDiagnostic("let(f, x => x, abs(f))").message).toBe(
      LAMBDA_AS_VALUE_MESSAGE
    );
    expect(soleDiagnostic("let(f, x => x, if(f, 1, 2))").message).toBe(
      LAMBDA_AS_VALUE_MESSAGE
    );
  });

  it("keeps the runtime's lambda-value escape hatches clean", () => {
    // ?? passes lambdas through; a lambda result or list item is legal.
    const coalesced = resultOf("let(f, x => x, f ?? 1)");
    expect(coalesced.diagnostics).toEqual([]);
    expectTypesEqual(
      coalesced.resultType,
      unionTypeOf(lambdaTypeOf([UNKNOWN_TYPE], UNKNOWN_TYPE), NUMBER_TYPE)
    );
    const root = resultOf("let(f, x => x, f)");
    expect(root.diagnostics).toEqual([]);
    expect(root.resultType.kind).toBe("lambda");
    expect(formulaTypeBadge(root.resultType)).toBe("function");
    expect(resultOf("let(f, x => x, [f])").diagnostics).toEqual([]);
  });
});

describe("if, switch, and unions", () => {
  it("types if as the union of its branches", () => {
    expectTypesEqual(
      typeOf('if(true, 1, "a")'),
      unionTypeOf(NUMBER_TYPE, TEXT_TYPE)
    );
    expect(typeOf("if(true, 1, 2)")).toEqual(NUMBER_TYPE);
    expectTypesEqual(
      typeOf("if(true, 1)"),
      unionTypeOf(NUMBER_TYPE, BLANK_TYPE)
    );
  });

  it("diagnoses a non-boolean condition at the condition span", () => {
    const result = resultOf("if(1, 2, 3)");
    expect(result.diagnostics).toEqual([
      {
        end: 4,
        message: "if() expects a boolean, got number",
        severity: "error",
        start: 3,
      },
    ]);
    expect(result.resultType).toEqual(UNKNOWN_TYPE);
  });

  it("types switch as the union of results (+ blank without default)", () => {
    expect(typeOf('switch(2, 1, "one", 2, "two", "many")')).toEqual(TEXT_TYPE);
    expectTypesEqual(
      typeOf('switch(1, 1, "a")'),
      unionTypeOf(TEXT_TYPE, BLANK_TYPE)
    );
    expectTypesEqual(
      typeOf('switch(1, 1, "a", 2, true)'),
      unionTypeOf(TEXT_TYPE, BOOLEAN_TYPE, BLANK_TYPE)
    );
  });

  it("accepts switch cases optimistically against the subject", () => {
    expect(soleDiagnostic('switch(1, "a", 2)')).toEqual({
      end: 13,
      message:
        "This case is text, but the switch value is number, so it can never match",
      severity: "error",
      start: 10,
    });
    // A union subject matches any member; only an impossible case diagnoses.
    const mixed = resultOf('switch(if(true, 1, "a"), "x", 1, true, 2)');
    expect(mixed.diagnostics).toHaveLength(1);
    expect(mixed.diagnostics[0].message).toBe(
      "This case is boolean, but the switch value is number or text, so it can never match"
    );
    // An unknown subject accepts every case.
    expect(typeOf('switch(thisPage.Calc, 1, "a", "b")', SCHEMA)).toEqual(
      TEXT_TYPE
    );
  });

  it("carries unions through nested control flow", () => {
    expectTypesEqual(
      typeOf('if(true, 1, "a") ?? now()'),
      unionTypeOf(NUMBER_TYPE, TEXT_TYPE, DATE_TYPE)
    );
    expect(typeOf('len(if(true, "a", 1))')).toEqual(NUMBER_TYPE);
  });
});

describe("member access", () => {
  it("diagnoses member access on a definite non-row at the member name span", () => {
    const result = resultOf('prop("f_est").owner', SCHEMA);
    expect(result.diagnostics).toEqual([
      {
        end: 19,
        message: "Property access works on a row from a relation, got number",
        severity: "error",
        start: 14,
      },
    ]);
    // The receiver is still walked for references.
    expect(result.references).toEqual(["f_est"]);
    expect(result.resultType).toEqual(UNKNOWN_TYPE);
  });

  it("stays optimistic when the receiver could be a row", () => {
    // Unknown receiver (an unresolved reference already diagnosed) adds no
    // second member diagnostic — one mistake, one diagnostic.
    const result = resultOf('prop("gone").owner', SCHEMA);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.resultType).toEqual(UNKNOWN_TYPE);
  });
});

// --- relation typing ---------------------------------------------------------

/** Local schema: Rel links to Tasks (db-t); Tasks has a relation on to Subs (db-u). */
const RELATION_PROPERTIES: FormulaCheckProperty[] = [
  { id: "f_est", kind: "number", name: "Estimate", type: UNKNOWN_TYPE },
  {
    id: "f_rel",
    kind: "relation",
    name: "Rel",
    targetDatabaseId: "db-t",
    type: UNKNOWN_TYPE,
  },
];

const RELATION_CONTEXT: FormulaCheckContext = {
  databases: new Map([
    [
      "db-t",
      {
        name: "Tasks",
        properties: [
          { id: "f-est", kind: "number", name: "Estimate", type: UNKNOWN_TYPE },
          { id: "f-done", kind: "checkbox", name: "Done", type: UNKNOWN_TYPE },
          { id: "f-total", kind: "formula", name: "Total", type: NUMBER_TYPE },
          {
            id: "f-subs",
            kind: "relation",
            name: "Subtasks",
            targetDatabaseId: "db-u",
            type: UNKNOWN_TYPE,
          },
        ],
      },
    ],
    [
      "db-u",
      {
        name: "Subs",
        properties: [
          { id: "f-name", kind: "text", name: "Name", type: UNKNOWN_TYPE },
        ],
      },
    ],
  ]),
  properties: RELATION_PROPERTIES,
};

function relationResultOf(source: string): FormulaCheckResult {
  const parsed = parseFormula(source);
  if (!parsed.ok) {
    throw new Error(
      `parse failed for ${JSON.stringify(source)}: ${parsed.error.message}`
    );
  }
  return checkFormula(parsed.ast, RELATION_CONTEXT);
}

function relationTypeOf(source: string): FormulaType {
  const result = relationResultOf(source);
  if (result.diagnostics.length > 0) {
    throw new Error(
      `expected no diagnostics for ${JSON.stringify(source)}, got: ${result.diagnostics[0].message}`
    );
  }
  return result.resultType;
}

describe("relation typing", () => {
  it("types a relation property as a list of the target's rows", () => {
    expectTypesEqual(
      relationTypeOf('prop("f_rel")'),
      listTypeOf(rowTypeOf("db-t"))
    );
    expect(formulaTypeBadge(listTypeOf(rowTypeOf("db-t")))).toBe(
      "list of rows"
    );
    expect(formulaTypeBadge(rowTypeOf("db-t"))).toBe("row");
  });

  it("types member access by field name against the target database", () => {
    expectTypesEqual(
      relationTypeOf('map(prop("f_rel"), r => r.Estimate)'),
      listTypeOf(NUMBER_TYPE)
    );
    // The rollup shape end-to-end, method spelling included.
    expectTypesEqual(
      relationTypeOf('prop("f_rel").map(r => r.Estimate).sum()'),
      NUMBER_TYPE
    );
    expectTypesEqual(relationTypeOf('first(prop("f_rel")).Done'), BOOLEAN_TYPE);
  });

  it("types a formula member with its precomputed result type", () => {
    expectTypesEqual(relationTypeOf('first(prop("f_rel")).Total'), NUMBER_TYPE);
  });

  it("types nested relation members recursively", () => {
    expectTypesEqual(
      relationTypeOf('first(prop("f_rel")).Subtasks'),
      listTypeOf(rowTypeOf("db-u"))
    );
    expectTypesEqual(
      relationTypeOf('first(prop("f_rel")).Subtasks.map(s => s.Name)'),
      listTypeOf(TEXT_TYPE)
    );
  });

  it("diagnoses unknown members naming the target database", () => {
    const result = relationResultOf('first(prop("f_rel")).Nope');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toBe(
      '"Nope" isn\'t a property of Tasks'
    );
    expect(result.resultType).toEqual(UNKNOWN_TYPE);
  });

  it("points member access on the whole relation list at .map", () => {
    const result = relationResultOf('prop("f_rel").Estimate');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toBe(
      'Use .map(r => r.Estimate) to read "Estimate" from each row of the list'
    );
  });

  it("checks members optimistically without a databases map", () => {
    const parsed = parseFormula('first(prop("f_rel")).Whatever');
    if (!parsed.ok) {
      throw new Error("parse failed");
    }
    const result = checkFormula(parsed.ast, {
      properties: RELATION_PROPERTIES,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.resultType).toEqual(UNKNOWN_TYPE);
  });
});

describe("bare names", () => {
  it("resolves lambda params and let bindings case-sensitively", () => {
    expect(typeOf("map([1], x => x)")).toEqual(listTypeOf(NUMBER_TYPE));
    expect(soleDiagnostic("let(total, 1, Total + 1)")).toEqual({
      end: 19,
      message: 'Unknown name "Total" — did you mean "total"?',
      severity: "error",
      start: 14,
    });
  });

  it("suggests the thisPage spelling for schema-field names", () => {
    expect(soleDiagnostic("Estimate + 1", SCHEMA)).toEqual({
      end: 8,
      message: 'Unknown name "Estimate" — did you mean "thisPage.Estimate"?',
      severity: "error",
      start: 0,
    });
  });

  it("prefers a case-insensitive binding over a schema field", () => {
    expect(soleDiagnostic("let(estimate, 1, Estimate)", SCHEMA).message).toBe(
      'Unknown name "Estimate" — did you mean "estimate"?'
    );
  });

  it("falls back to a plain unknown-name error", () => {
    expect(soleDiagnostic("nope")).toEqual({
      end: 4,
      message: 'Unknown name "nope"',
      severity: "error",
      start: 0,
    });
  });
});

describe("references and unresolved names", () => {
  it("dedupes mixed canonical and scope refs in source order", () => {
    const result = resultOf(
      'prop("f_est") + thisPage.estimate + thisPage.Done',
      SCHEMA
    );
    expect(result.diagnostics).toHaveLength(1); // number + boolean
    expect(result.references).toEqual(["f_est", "f_done"]);
    expect(result.unresolvedNames).toEqual([]);
  });

  it("keeps source order across operators and lambda bodies", () => {
    const result = resultOf(
      "thisPage.Done ?? map(thisPage.Tags, t => t + thisPage.Title)",
      SCHEMA
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.references).toEqual(["f_done", "f_tags", "f_title"]);
  });

  it("keeps unknown prop ids in references so broken refs can heal", () => {
    const result = resultOf('prop("f_gone") + 1', SCHEMA);
    expect(result.diagnostics).toEqual([
      {
        end: 14,
        message: "References a deleted or unknown field",
        severity: "error",
        start: 0,
      },
    ]);
    expect(result.references).toEqual(["f_gone"]);
    expect(result.unresolvedNames).toEqual([]);
  });

  it("never falls back to names for canonical prop() refs", () => {
    // Evaluation would resolve "Estimate" by name; a canonical id reference
    // is a chip, and a chip that lost its field is a broken chip.
    const result = resultOf('prop("Estimate")', SCHEMA);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.references).toEqual(["Estimate"]);
  });

  it("collects unresolved scope names, deduped", () => {
    const result = resultOf("thisPage.Missing + thisPage.Missing", SCHEMA);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toEqual({
      end: 16,
      message: 'Unknown property "Missing"',
      severity: "error",
      start: 0,
    });
    expect(result.references).toEqual([]);
    expect(result.unresolvedNames).toEqual(["Missing"]);
  });
});

describe("formulaTypeBadge", () => {
  it("labels types for the editor badge", () => {
    expect(formulaTypeBadge(NUMBER_TYPE)).toBe("number");
    expect(formulaTypeBadge(TEXT_TYPE)).toBe("text");
    expect(formulaTypeBadge(BOOLEAN_TYPE)).toBe("boolean");
    expect(formulaTypeBadge(DATE_TYPE)).toBe("date");
    expect(formulaTypeBadge(listTypeOf(NUMBER_TYPE))).toBe("list of numbers");
    expect(formulaTypeBadge(unionTypeOf(NUMBER_TYPE, TEXT_TYPE))).toBe(
      "number or text"
    );
    expect(formulaTypeBadge(UNKNOWN_TYPE)).toBe("unknown");
    // Internal kinds never leak their names to users.
    expect(formulaTypeBadge(ERROR_TYPE)).toBe("unknown");
    expect(formulaTypeBadge({ kind: "typevar", name: "T" })).toBe("unknown");
  });

  it("suppresses the blank member of a union (display only)", () => {
    expect(formulaTypeBadge(unionTypeOf(NUMBER_TYPE, BLANK_TYPE))).toBe(
      "number"
    );
    expect(
      formulaTypeBadge(unionTypeOf(NUMBER_TYPE, TEXT_TYPE, BLANK_TYPE))
    ).toBe("number or text");
    expect(formulaTypeBadge(typeOf("if(true, 1)"))).toBe("number");
    // Plain blank is not a union; it still reads as itself.
    expect(formulaTypeBadge(BLANK_TYPE)).toBe("blank");
  });
});

describe("catalog signature audit", () => {
  for (const entry of FORMULA_FUNCTION_CATALOG) {
    it(`${entry.name} examples evaluate AND check clean`, () => {
      for (const example of entry.examples) {
        const parsed = parseFormula(example);
        expect(parsed.ok, `${entry.name}: ${example}`).toBe(true);
        if (!parsed.ok) {
          continue;
        }
        // No current example references a property, so the empty context is
        // the honest one; a future property-dependent example fails here
        // loudly and should bring its own fake schema.
        const checked = checkFormula(parsed.ast, { properties: [] });
        expect(checked.diagnostics, `${entry.name}: ${example}`).toEqual([]);
        const value = evaluateFormula(parsed.ast, BLANK_SCOPE);
        expect(isFormulaError(value), `${entry.name}: ${example}`).toBe(false);
      }
    });
  }

  it("declares two-param (item, index) lambdas for the runtime-supplied HOFs", () => {
    for (const name of [
      "map",
      "filter",
      "find",
      "findIndex",
      "some",
      "every",
    ]) {
      const entry = formulaFunctionForName(name);
      const lambdaParam = entry?.params.find(
        (param) => param.type.kind === "lambda"
      );
      expect(lambdaParam, name).toBeDefined();
      if (lambdaParam?.type.kind === "lambda") {
        expect(lambdaParam.type.params, name).toHaveLength(2);
      }
    }
    const sortKey = formulaFunctionForName("sort")?.params.find(
      (param) => param.type.kind === "lambda"
    );
    if (sortKey?.type.kind === "lambda") {
      expect(sortKey.type.params).toHaveLength(1);
    }
  });
});

/**
 * "Wrong type"-class runtime error shapes. If the checker passed an
 * expression clean, evaluating it must never produce one of these.
 */
const WRONG_TYPE_ERROR_PATTERNS = [
  /expects .*, got /,
  /^Cannot (?:add|apply|compare|negate|convert)/,
  /is not a function/,
  /^Unknown (?:function|name|property)/,
  /can only be used/,
  /names \d+ parameters/,
];

describe("check-vs-runtime consistency", () => {
  it("let-bound lambda verdicts match runtime behavior exactly", () => {
    const cases: { clean: boolean; source: string }[] = [
      { clean: true, source: "let(f, x => x + 1, f(2))" },
      { clean: true, source: "let(f, x => x, f(1, 2))" },
      { clean: true, source: "let(f, x => x + 1, map([1, 2], f))" },
      { clean: true, source: "let(f, x => x > 1, filter([1, 2], f))" },
      { clean: true, source: "let(f, x => x, f ?? 1)" },
      { clean: true, source: "let(f, x => x, f)" },
      { clean: true, source: "let(f, x => x, [f])" },
      { clean: true, source: "let(f, x => x + 1, let(g, f, g(2)))" },
      { clean: true, source: "lets(f, x => x + 1, y, f(2), y * 2)" },
      { clean: false, source: "let(f, (a, b) => a + b, f(1))" },
      { clean: false, source: "let(f, x => x, 1 + f)" },
      { clean: false, source: "let(f, x => x, -f)" },
      { clean: false, source: "let(f, x => x, f == 1)" },
      { clean: false, source: "let(f, x => x, abs(f))" },
      { clean: false, source: "let(f, x => x, if(f, 1, 2))" },
      { clean: false, source: "let(f, (a, b, c) => a, map([1, 2], f))" },
      { clean: false, source: "let(f, x => 1, filter([1, 2], f))" },
    ];
    for (const { clean, source } of cases) {
      const parsed = parseFormula(source);
      expect(parsed.ok, source).toBe(true);
      if (!parsed.ok) {
        continue;
      }
      const checked = checkFormula(parsed.ast, { properties: [] });
      const value = evaluateFormula(parsed.ast, BLANK_SCOPE);
      if (clean) {
        expect(checked.diagnostics, source).toEqual([]);
        expect(isFormulaError(value), source).toBe(false);
      } else {
        expect(checked.diagnostics.length, source).toBeGreaterThan(0);
        expect(isFormulaError(value), source).toBe(true);
      }
    }
  });

  it("checker-clean catalog examples never hit runtime type errors", () => {
    for (const entry of FORMULA_FUNCTION_CATALOG) {
      for (const example of entry.examples) {
        const parsed = parseFormula(example);
        if (!parsed.ok) {
          continue;
        }
        const checked = checkFormula(parsed.ast, { properties: [] });
        if (checked.diagnostics.length > 0) {
          continue;
        }
        const value = evaluateFormula(parsed.ast, BLANK_SCOPE);
        if (isFormulaError(value)) {
          const wrongType = WRONG_TYPE_ERROR_PATTERNS.some((pattern) =>
            pattern.test(value.message)
          );
          expect(
            wrongType,
            `${entry.name}: ${example} → ${value.message}`
          ).toBe(false);
        }
      }
    }
  });
});
