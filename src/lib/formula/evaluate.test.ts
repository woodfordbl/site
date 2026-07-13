import { format as dateFnsFormat } from "date-fns/format";
import { describe, expect, it } from "vitest";

import type { FormulaNode } from "@/lib/formula/ast.ts";
import { V1_GOLDEN_CORPUS } from "@/lib/formula/corpus.fixture.ts";
import { formulaValueToDisplay } from "@/lib/formula/display.ts";
import { evaluateFormula, isVolatileFormula } from "@/lib/formula/evaluate.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import {
  FORMULA_FIXED_NOW_ISO,
  FormulaDate,
  FormulaLambda,
  FormulaRowRef,
  type FormulaScope,
  type FormulaValue,
  formulaError,
  isFormulaError,
  LAMBDA_AS_VALUE_MESSAGE,
} from "@/lib/formula/values.ts";

/** Scope over a plain record; unknown names produce an error value. */
function scopeOf(properties: Record<string, FormulaValue> = {}): FormulaScope {
  return {
    getProperty: (name) =>
      name in properties
        ? properties[name]
        : formulaError(`Unknown property "${name}"`),
  };
}

function astOf(source: string): FormulaNode {
  const parsed = parseFormula(source);
  if (!parsed.ok) {
    throw new Error(
      `parse failed for ${JSON.stringify(source)}: ${parsed.error.message}`
    );
  }
  return parsed.ast;
}

function run(source: string, scope: FormulaScope = scopeOf()): FormulaValue {
  return evaluateFormula(astOf(source), scope);
}

function errorMessage(value: FormulaValue): string {
  if (!isFormulaError(value)) {
    throw new Error(`expected a FormulaError, got ${JSON.stringify(value)}`);
  }
  return value.message;
}

describe("arithmetic", () => {
  it("evaluates the v1 basics", () => {
    expect(run("1 + 2")).toBe(3);
    expect(run("2 * 3 + 4")).toBe(10);
    expect(run("10 / 4")).toBe(2.5);
    expect(run("7 % 3")).toBe(1);
    expect(run("-(2 + 3)")).toBe(-5);
    expect(run("2 * (3 + 4)")).toBe(14);
  });

  it("concatenates when either side of + is text", () => {
    expect(run('"a" + "b"')).toBe("ab");
    expect(run('"a" + 1')).toBe("a1");
    expect(run('1 + "a"')).toBe("1a");
    expect(run('"is " + true')).toBe("is true");
  });

  it("concatenates dates via their display string", () => {
    expect(run('"due " + parseDate("2026-03-05")')).toBe("due 2026-03-05");
  });

  it("errors on blank + anything (unlike v1's silent coercion)", () => {
    expect(errorMessage(run("null + 1"))).toBe("Cannot add empty and number");
    expect(errorMessage(run('null + "x"'))).toBe("Cannot add empty and text");
    expect(errorMessage(run('"x" + null'))).toBe("Cannot add text and empty");
  });

  it("errors on non-numeric arithmetic with v1 messages", () => {
    expect(errorMessage(run('"5" * 2'))).toContain('Cannot apply "*"');
    expect(errorMessage(run("true - 1"))).toContain('Cannot apply "-"');
    expect(errorMessage(run("null - 1"))).toBe(
      'Cannot apply "-" to empty and number'
    );
  });

  it("errors on date + number (dateAdd exists for that)", () => {
    expect(errorMessage(run('parseDate("2026-01-01") + 1'))).toBe(
      "Cannot add date and number"
    );
  });

  it("errors on division by zero", () => {
    expect(errorMessage(run("1 / 0"))).toBe("Division by zero");
    expect(errorMessage(run("5 % 0"))).toBe("Division by zero");
  });

  it("errors when negating a non-number", () => {
    expect(errorMessage(run('-"a"'))).toBe("Cannot negate text");
    expect(errorMessage(run("-null"))).toBe("Cannot negate empty");
  });

  it("errors on list + text", () => {
    expect(errorMessage(run('[1] + "x"'))).toBe(
      "Cannot convert a list to text"
    );
  });
});

describe("power", () => {
  it("evaluates ^ with right associativity", () => {
    expect(run("2 ^ 10")).toBe(1024);
    expect(run("2 ^ 3 ^ 2")).toBe(512);
    expect(run("-2 ^ 2")).toBe(-4);
    expect(run("2 ^ -1")).toBe(0.5);
  });

  it("defines 0 ^ 0 as 1", () => {
    expect(run("0 ^ 0")).toBe(1);
  });

  it("errors on non-finite results", () => {
    expect(errorMessage(run("2 ^ 10000"))).toBe(
      'Result of "^" is not a finite number'
    );
    expect(errorMessage(run("(0 - 8) ^ 0.5"))).toBe(
      'Result of "^" is not a finite number'
    );
  });

  it("errors on non-number operands", () => {
    expect(errorMessage(run('"a" ^ 2'))).toBe(
      'Cannot apply "^" to text and number'
    );
  });
});

describe("comparisons", () => {
  it("orders numbers and text like v1", () => {
    expect(run("1 < 2")).toBe(true);
    expect(run("2 <= 2")).toBe(true);
    expect(run("3 > 4")).toBe(false);
    expect(run('"a" < "b"')).toBe(true);
    expect(run('"b" > "ba"')).toBe(false);
  });

  it("orders dates by instant", () => {
    expect(run('parseDate("2026-01-05") < parseDate("2026-02-01")')).toBe(true);
    expect(run('parseDate("2026-01-05") >= parseDate("2026-01-05")')).toBe(
      true
    );
    expect(
      run('parseDate("2026-01-01T10:00:00") < parseDate("2026-01-01T11:00:00")')
    ).toBe(true);
  });

  it("errors on mixed-type and blank ordering with v1 messages", () => {
    expect(errorMessage(run('1 < "a"'))).toBe("Cannot compare number and text");
    expect(errorMessage(run("true > 0"))).toBe(
      "Cannot compare boolean and number"
    );
    expect(errorMessage(run("null < 1"))).toBe(
      "Cannot compare empty and number"
    );
    expect(errorMessage(run('parseDate("2026-01-01") < "2026-02-01"'))).toBe(
      "Cannot compare date and text"
    );
  });
});

describe("equality", () => {
  it("keeps v1 type-aware equality", () => {
    expect(run("1 == 1")).toBe(true);
    expect(run('"x" != "y"')).toBe(true);
    expect(run("null == null")).toBe(true);
    expect(run("null != null")).toBe(false);
    expect(run('1 == "1"')).toBe(false);
    expect(run("null == 0")).toBe(false);
    expect(run("true == 1")).toBe(false);
  });

  it("compares lists element-wise and recursively", () => {
    expect(run("[1, 2] == [1, 2]")).toBe(true);
    expect(run("[1, 2] == [2, 1]")).toBe(false);
    expect(run("[[1], null] == [[1], null]")).toBe(true);
    expect(run("[1] == 1")).toBe(false);
  });

  it("compares dates by instant", () => {
    expect(run('parseDate("2026-03-05") == parseDate("2026-03-05")')).toBe(
      true
    );
    expect(run('parseDate("2026-03-05") != parseDate("2026-03-06")')).toBe(
      true
    );
    expect(run('parseDate("2026-03-05") == "2026-03-05"')).toBe(false);
  });

  it("rejects lambdas in equality", () => {
    expect(errorMessage(run("(x => x) == (y => y)"))).toBe(
      LAMBDA_AS_VALUE_MESSAGE
    );
  });
});

describe("coalesce", () => {
  it("returns the left side unless it is blank", () => {
    expect(run('"a" ?? "b"')).toBe("a");
    expect(run('null ?? "b"')).toBe("b");
    expect(run("0 ?? 1")).toBe(0);
    expect(run('"" ?? "b"')).toBe("");
    expect(run("null ?? null ?? 3")).toBe(3);
  });

  it("does not catch errors — they are not blanks", () => {
    expect(errorMessage(run("1 / 0 ?? 2"))).toBe("Division by zero");
  });

  it("short-circuits the fallback", () => {
    expect(run("1 ?? 1 / 0")).toBe(1);
  });

  it("passes lambdas through as values", () => {
    expect(run("null ?? (x => x)")).toBeInstanceOf(FormulaLambda);
  });
});

describe("logic operators", () => {
  it("evaluates and/or/not strictly (no truthiness)", () => {
    expect(run("true and false")).toBe(false);
    expect(run("false or true")).toBe(true);
    expect(run("not true")).toBe(false);
    expect(run("!false")).toBe(true);
    expect(run("true && false || true")).toBe(true);
    expect(errorMessage(run("1 and true"))).toBe(
      '"and" expects a boolean, got number'
    );
    expect(errorMessage(run('false or "x"'))).toBe(
      '"or" expects a boolean, got text'
    );
    expect(errorMessage(run("not 1"))).toBe(
      '"not" expects a boolean, got number'
    );
    expect(errorMessage(run("null and true"))).toBe(
      '"and" expects a boolean, got empty'
    );
  });

  it("short-circuits — the untaken side never runs", () => {
    expect(run("false and (1 / 0 == 0)")).toBe(false);
    expect(run("true or (1 / 0 == 0)")).toBe(true);
  });
});

describe("logic functions", () => {
  it("and()/or() are variadic and lazy", () => {
    expect(run("and(true, true, true)")).toBe(true);
    expect(run("and(true, false, 1 / 0 == 0)")).toBe(false);
    expect(run("or(false, false, true, 1 / 0 == 0)")).toBe(true);
    expect(errorMessage(run("and(true, 1)"))).toBe(
      '"and" expects a boolean, got number'
    );
    expect(errorMessage(run("and(true)"))).toBe(
      "and() expects at least 2 argument(s), got 1"
    );
  });

  it("not() inverts and empty() matches v1 emptiness", () => {
    expect(run("not(1 > 2)")).toBe(true);
    expect(run("empty(null)")).toBe(true);
    expect(run('empty("")')).toBe(true);
    expect(run('empty("   ")')).toBe(true);
    expect(run('empty("x")')).toBe(false);
    expect(run("empty(0)")).toBe(false);
    expect(run("empty(false)")).toBe(false);
  });
});

describe("if", () => {
  it("returns the taken branch and is lazy", () => {
    expect(run("if(true, 1, 2)")).toBe(1);
    expect(run("if(false, 1, 2)")).toBe(2);
    expect(run("if(true, 1, 1 / 0)")).toBe(1);
    expect(run("if(false, 1 / 0, 2)")).toBe(2);
    expect(run("if(2 != 0, 10 / 2, 0)")).toBe(5);
  });

  it("supports the 2-argument form with a blank else", () => {
    expect(run("if(true, 1)")).toBe(1);
    expect(run("if(false, 1)")).toBe(null);
    expect(run('if(false, 1) ?? "none"')).toBe("none");
  });

  it("errors on non-boolean conditions with the v1 message", () => {
    expect(errorMessage(run("if(1, 2, 3)"))).toBe(
      '"if" expects a boolean, got number'
    );
    expect(errorMessage(run("if(1 / 0 == 0, 1, 2)"))).toBe("Division by zero");
  });

  it("errors on wrong arity", () => {
    expect(errorMessage(run("if(true)"))).toBe(
      "if() expects 2 to 3 arguments, got 1"
    );
    expect(errorMessage(run("if(true, 1, 2, 3)"))).toBe(
      "if() expects 2 to 3 arguments, got 4"
    );
  });
});

describe("switch", () => {
  it("matches cases with == semantics", () => {
    expect(run('switch(2, 1, "one", 2, "two", "many")')).toBe("two");
    expect(run('switch("b", "a", 1, "b", 2)')).toBe(2);
    expect(run('switch([1], [1], "list", "other")')).toBe("list");
  });

  it("falls back to the default, else blank", () => {
    expect(run('switch(9, 1, "one", "other")')).toBe("other");
    expect(run('switch(9, 1, "one")')).toBe(null);
    expect(run('switch(9, 1, "one") ?? "none"')).toBe("none");
  });

  it("is lazy — untaken results and later cases never run", () => {
    expect(run('switch(1, 1, "one", 2, 1 / 0)')).toBe("one");
    expect(run("switch(1, 2, 1 / 0, 1)")).toBe(1);
  });

  it("propagates errors from the value and taken cases", () => {
    expect(errorMessage(run('switch(1 / 0, 1, "one")'))).toBe(
      "Division by zero"
    );
    expect(errorMessage(run('switch(1, 1 / 0, "one")'))).toBe(
      "Division by zero"
    );
  });

  it("errors on wrong arity", () => {
    expect(errorMessage(run("switch(1, 2)"))).toBe(
      "switch() expects at least 3 argument(s), got 2"
    );
  });
});

describe("let / lets", () => {
  it("binds names for the body", () => {
    expect(run("let(x, 1, x + 1)")).toBe(2);
    expect(run("lets(a, 1, b, a + 1, b * 2)")).toBe(4);
  });

  it("shadows outer bindings and stays case-sensitive", () => {
    expect(run("let(x, 1, let(x, 2, x))")).toBe(2);
    expect(run("let(X, 1, let(x, 2, X))")).toBe(1);
  });

  it("requires name nodes in binding positions", () => {
    expect(errorMessage(run("let(1, 2, 3)"))).toBe(
      "let() expects a name as argument 1, like let(x, 1, x + 1)"
    );
    expect(errorMessage(run("lets(a, 1, 2, 3, a)"))).toContain(
      "lets() expects a name as argument 3"
    );
  });

  it("errors on wrong arity", () => {
    expect(errorMessage(run("let(x, 1)"))).toBe(
      "let() expects 3 arguments, got 2"
    );
    expect(errorMessage(run("lets(a, 1)"))).toBe(
      "lets() expects at least 3 arguments, got 2"
    );
    expect(errorMessage(run("lets(a, 1, b, 2)"))).toBe(
      "lets() expects name/value pairs followed by one result, got 4 arguments"
    );
  });

  it("propagates binding-value errors eagerly", () => {
    expect(errorMessage(run("let(x, 1 / 0, 2)"))).toBe("Division by zero");
  });

  it("calls a bound lambda by name", () => {
    expect(run("let(f, x => x + 1, f(2))")).toBe(3);
    expect(
      run("lets(inc, x => x + 1, twice, x => inc(inc(x)), twice(1))")
    ).toBe(3);
  });

  it("rejects calling a non-lambda binding", () => {
    expect(errorMessage(run("let(f, 5, f(2))"))).toBe('"f" is not a function');
  });
});

describe("let statements (parser sugar)", () => {
  it("computes identically to the nested let() call form", () => {
    const statements =
      "let tax = 0.1;\nlet total = 100 * (1 + tax);\nround(total, 2)";
    const calls = "let(tax, 0.1, let(total, 100 * (1 + tax), round(total, 2)))";
    expect(run(statements)).toBe(110);
    expect(run(statements)).toBe(run(calls));
  });

  it("shadows earlier bindings in statement order, like nested let()", () => {
    const statements = "let x = 1; let x = x + 2; x * 10";
    expect(run(statements)).toBe(30);
    expect(run(statements)).toBe(run("let(x, 1, let(x, x + 2, x * 10))"));
  });

  it("reads properties inside statement values", () => {
    expect(
      run('let t = prop("price") * 2;\nt + 1', scopeOf({ price: 10 }))
    ).toBe(21);
  });

  it("binds and calls lambdas through statements", () => {
    expect(run("let double = x => x * 2;\ndouble(21)")).toBe(42);
  });
});

describe("names", () => {
  it("errors on unknown names, with a case hint from in-scope bindings", () => {
    expect(errorMessage(run("score"))).toBe('Unknown name "score"');
    expect(errorMessage(run("let(foo, 1, Foo)"))).toBe(
      'Unknown name "Foo" — did you mean "foo"?'
    );
  });

  it("resolves lambda parameters case-sensitively", () => {
    expect(errorMessage(run("map([1], x => X)"))).toBe(
      'Unknown name "X" — did you mean "x"?'
    );
  });
});

describe("lambdas and higher-order functions", () => {
  it("map transforms items, with an optional index parameter", () => {
    expect(run("map([1, 2, 3], x => x * 2)")).toEqual([2, 4, 6]);
    expect(run("map([10, 20], (x, i) => x + i)")).toEqual([10, 21]);
    expect(run("[1, 2].map(x => x + 1)")).toEqual([2, 3]);
  });

  it("closures capture their defining environment", () => {
    expect(run("let(n, 10, map([1, 2], x => x + n))")).toEqual([11, 12]);
  });

  it("filter/find/findIndex/some/every use strict boolean predicates", () => {
    expect(run("filter([1, 2, 3, 4], x => x > 2)")).toEqual([3, 4]);
    expect(run("find([1, 2, 3], x => x > 1)")).toBe(2);
    expect(run('find([1], x => x > 5) ?? "none"')).toBe("none");
    expect(run('findIndex(["a", "b"], x => x == "b")')).toBe(1);
    expect(run("findIndex([1], x => x > 5)")).toBe(-1);
    expect(run("some([1, 2], x => x > 1)")).toBe(true);
    expect(run("some([], x => true)")).toBe(false);
    expect(run("every([1, 2], x => x > 0)")).toBe(true);
    expect(run("every([], x => false)")).toBe(true);
    expect(errorMessage(run("filter([1], x => x)"))).toBe(
      '"filter" expects a boolean, got number'
    );
  });

  it("propagates errors from lambda bodies", () => {
    expect(errorMessage(run("map([1, 0], x => 1 / x)"))).toBe(
      "Division by zero"
    );
  });

  it("rejects lambdas declaring more parameters than provided", () => {
    expect(errorMessage(run("map([1], (a, b, c) => a)"))).toBe(
      "The lambda names 3 parameters, but only 2 value(s) are provided here"
    );
  });

  it("rejects lambdas used as plain values", () => {
    expect(errorMessage(run("1 + (x => x)"))).toBe(LAMBDA_AS_VALUE_MESSAGE);
    expect(errorMessage(run("-(x => x)"))).toBe(LAMBDA_AS_VALUE_MESSAGE);
    expect(errorMessage(run("abs(x => x)"))).toBe(LAMBDA_AS_VALUE_MESSAGE);
  });

  it("caps runaway lambda recursion with a friendly error", () => {
    expect(errorMessage(run("let(f, g => g(g), f(f))"))).toContain(
      "recursion went too deep"
    );
  });
});

describe("list functions", () => {
  it("sorts naturally by one type, blanks last, optionally by key", () => {
    expect(run("sort([3, 1, 2])")).toEqual([1, 2, 3]);
    expect(run('sort(["b", "a"])')).toEqual(["a", "b"]);
    expect(run("sort([2, null, 1])")).toEqual([1, 2, null]);
    expect(run('sort(["bbb", "a", "cc"], x => len(x))')).toEqual([
      "a",
      "cc",
      "bbb",
    ]);
    expect(
      run(
        'map(sort([parseDate("2026-02-01"), parseDate("2026-01-01")]), d => formatDate(d, "MM"))'
      )
    ).toEqual(["01", "02"]);
  });

  it("rejects mixed or unorderable sorts", () => {
    expect(errorMessage(run('sort([2, "a"])'))).toBe(
      "sort() expects values of one type, got number and text"
    );
    expect(errorMessage(run("sort([true])"))).toBe(
      "sort() can only order numbers, text, and dates, got boolean"
    );
  });

  it("unique dedupes with == semantics, keeping first occurrences", () => {
    expect(run("unique([1, 2, 2, 3, 1])")).toEqual([1, 2, 3]);
    expect(run("unique([[1], [1]])")).toEqual([[1]]);
    expect(run('unique([1, "1"])')).toEqual([1, "1"]);
  });

  it("reverse, flat, first, last, at, slice, includes, length, count, join", () => {
    expect(run("reverse([1, 2, 3])")).toEqual([3, 2, 1]);
    expect(run("flat([[1], [2, 3]])")).toEqual([1, 2, 3]);
    expect(run("flat([[1], [[2]]])")).toEqual([1, [2]]);
    expect(run("first([1, 2])")).toBe(1);
    expect(run('first([]) ?? "none"')).toBe("none");
    expect(run("last([1, 2])")).toBe(2);
    expect(run('last([]) ?? "none"')).toBe("none");
    expect(run('at(["a", "b"], 1)')).toBe("b");
    expect(run('at(["a", "b"], -1)')).toBe("b");
    expect(run('at(["a"], 5) ?? "none"')).toBe("none");
    expect(run("slice([1, 2, 3, 4], 1, 3)")).toEqual([2, 3]);
    expect(run("slice([1, 2, 3], -2)")).toEqual([2, 3]);
    expect(run("includes([1, 2], 2)")).toBe(true);
    expect(run('includes([1], "1")')).toBe(false);
    expect(run("length([1, null, 2])")).toBe(3);
    expect(run("count([1, null, 2])")).toBe(2);
    expect(run('join([1, 2, 3], "-")')).toBe("1-2-3");
    expect(run("[1, 2].length()")).toBe(2);
  });

  it("join refuses nested lists", () => {
    expect(errorMessage(run('join([[1]], "-")'))).toBe(
      "Cannot convert a list to text"
    );
  });

  it("gates list and lambda argument types generically", () => {
    expect(errorMessage(run("length(5)"))).toBe(
      "length() expects a list, got number"
    );
    expect(errorMessage(run('length("abc")'))).toBe(
      "length() expects a list, got text"
    );
    expect(errorMessage(run("map(5, x => x)"))).toBe(
      "map() expects a list, got number"
    );
    expect(errorMessage(run("map([1], 5)"))).toBe(
      "map() expects a function, got number"
    );
  });
});

describe("aggregates", () => {
  it("accepts one list, skipping blanks", () => {
    expect(run("sum([1, 2, null, 3])")).toBe(6);
    expect(run("sum([])")).toBe(0);
    expect(run("average([2, 4, null])")).toBe(3);
    expect(run("min([3, 1, null])")).toBe(1);
    expect(run("max([3, 1])")).toBe(3);
  });

  it("returns blank extremes and errors the empty average", () => {
    expect(run('min([]) ?? "none"')).toBe("none");
    expect(run("min([null]) ?? 9")).toBe(9);
    expect(errorMessage(run("average([])"))).toBe(
      "average(): cannot average an empty list"
    );
    expect(errorMessage(run("average([null])"))).toBe(
      "average(): cannot average an empty list"
    );
  });

  it("keeps v1 variadic-scalar strictness (blanks are errors)", () => {
    expect(run("sum(1, 2, 3)")).toBe(6);
    expect(run("min(3, 1, 2)")).toBe(1);
    expect(run("average(2, 4, 6)")).toBe(4);
    expect(run("avg(2, 4)")).toBe(3);
    expect(errorMessage(run("sum(1, null)"))).toBe(
      "sum() expects a number, got empty"
    );
    expect(errorMessage(run('min(1, "a")'))).toBe(
      "min() expects a number, got text"
    );
    expect(errorMessage(run("avg(true)"))).toBe(
      "avg() expects a number, got boolean"
    );
  });

  it("rejects non-number list elements and multiple lists", () => {
    expect(errorMessage(run('sum([1, "a"])'))).toBe(
      "sum() expects a number, got text"
    );
    expect(errorMessage(run("sum([1, 2], [3])"))).toBe(
      "sum() expects a number, got list"
    );
  });

  it("propagates errors from arguments", () => {
    expect(errorMessage(run("sum(1, 1 / 0)"))).toBe("Division by zero");
    expect(errorMessage(run("sum([1, 1 / 0])"))).toBe("Division by zero");
  });
});

describe("math functions", () => {
  it("keeps v1 behaviors for shared names", () => {
    expect(run("round(3.456)")).toBe(3);
    expect(run("round(3.456, 2)")).toBe(3.46);
    expect(run("floor(3.7)")).toBe(3);
    expect(run("ceil(3.1)")).toBe(4);
    expect(run("abs(-2.5)")).toBe(2.5);
    expect(errorMessage(run('round("x")'))).toBe(
      "round() expects a number, got text"
    );
    expect(errorMessage(run("floor(null)"))).toBe(
      "floor() expects a number, got empty"
    );
    expect(errorMessage(run("round()"))).toBe(
      "round() expects 1 to 2 arguments, got 0"
    );
  });

  it("adds sqrt and mod", () => {
    expect(run("sqrt(9)")).toBe(3);
    expect(run("mod(7, 3)")).toBe(1);
    expect(run("mod(0 - 7, 3)")).toBe(-1);
    expect(errorMessage(run("sqrt(0 - 1)"))).toBe(
      "sqrt(): cannot take the square root of a negative number"
    );
    expect(errorMessage(run("mod(1, 0)"))).toBe("Division by zero");
  });
});

describe("text functions", () => {
  it("keeps v1 coercion behaviors exactly", () => {
    expect(run('concat("a", 1, true, null, "b")')).toBe("a1trueb");
    expect(run('len("abc")')).toBe(3);
    expect(run("len(null)")).toBe(0);
    expect(run("len(42)")).toBe(2);
    expect(run('lower("AbC")')).toBe("abc");
    expect(run('upper("AbC")')).toBe("ABC");
    expect(run('trim("  x  ")')).toBe("x");
    expect(run('contains("hello", "ell")')).toBe(true);
    expect(run('contains("hello", "ELL")')).toBe(false);
    expect(run('replace("a-b-c", "-", "+")')).toBe("a+b+c");
    expect(run("format(1234.5)")).toBe("1,234.5");
    expect(run("format(true)")).toBe("Yes");
    expect(run("format(null)")).toBe("");
  });

  it("adds startsWith/endsWith/split", () => {
    expect(run('startsWith("hello", "he")')).toBe(true);
    expect(run('startsWith("hello", "lo")')).toBe(false);
    expect(run('endsWith("hello", "lo")')).toBe(true);
    expect(run('split("a,b,c", ",")')).toEqual(["a", "b", "c"]);
    expect(run('split("abc", "")')).toEqual(["a", "b", "c"]);
    expect(run('join(split("a-b", "-"), "+")')).toBe("a+b");
  });

  it("format displays dates and lists", () => {
    expect(run('format(parseDate("2026-03-05"))')).toBe("2026-03-05");
    expect(run("format([1, 2])")).toBe("1, 2");
  });

  it("refuses lists where text is coerced", () => {
    expect(errorMessage(run("upper([1])"))).toBe(
      "Cannot convert a list to text"
    );
  });
});

describe("date functions", () => {
  it("parseDate handles ISO dates, timestamps, and returns blank on failure", () => {
    expect(run('format(parseDate("2026-03-05"))')).toBe("2026-03-05");
    expect(run('hour(parseDate("2026-03-05T10:30:00"))')).toBe(10);
    expect(run('minute(parseDate("2026-03-05T10:30:00"))')).toBe(30);
    expect(run('minute(parseDate("2026-03-05T10:30:15.250"))')).toBe(30);
    expect(run('parseDate("nope") ?? "none"')).toBe("none");
    expect(run('parseDate("2026-02-31") ?? "bad"')).toBe("bad");
    expect(errorMessage(run("parseDate(42)"))).toBe(
      "parseDate() expects text, got number"
    );
  });

  it("parseDate accepts Z and ±hh:mm offsets as the same instant", () => {
    expect(
      run(
        'parseDate("2026-03-05T10:30:00Z") == parseDate("2026-03-05T11:30:00+01:00")'
      )
    ).toBe(true);
    expect(
      run(
        'parseDate("2026-03-05T10:30-05:00") == parseDate("2026-03-05T15:30Z")'
      )
    ).toBe(true);
  });

  it("parseDate accepts the space-separated variant as time-bearing", () => {
    expect(run('format(parseDate("2026-03-05 10:30"))')).toBe(
      "2026-03-05 10:30"
    );
    expect(run('hour(parseDate("2026-03-05 10:30:45"))')).toBe(10);
  });

  it("parseDate rejects engine-dependent non-ISO formats for determinism", () => {
    // `new Date("March 5, 2026")` parses in some engines and not others —
    // formulas must evaluate identically everywhere, so only ISO parses.
    expect(run('parseDate("March 5, 2026") ?? "none"')).toBe("none");
    expect(run('parseDate("3/5/2026") ?? "none"')).toBe("none");
    expect(run('parseDate("2026-3-5") ?? "none"')).toBe("none");
    expect(run('parseDate("2026-02-31T10:00") ?? "bad"')).toBe("bad");
    expect(run('parseDate("2026-03-05T25:00") ?? "bad"')).toBe("bad");
    expect(run('parseDate("2026-03-05T10:61") ?? "bad"')).toBe("bad");
  });

  it("formatDate renders via date-fns and validates patterns", () => {
    expect(run('formatDate(parseDate("2026-03-05"), "MMM d")')).toBe("Mar 5");
    expect(run('formatDate(parseDate("2026-03-05"), "yyyy")')).toBe("2026");
    expect(
      errorMessage(run('formatDate(parseDate("2026-03-05"), "bogus-x")'))
    ).toContain("invalid format pattern");
  });

  it("requires real date values (text no longer coerces)", () => {
    expect(errorMessage(run('formatDate("2026-03-05", "MMM d")'))).toBe(
      "formatDate() expects a date, got text"
    );
    expect(
      errorMessage(run('dateDiff(null, parseDate("2026-01-01"), "days")'))
    ).toBe("dateDiff() expects a date, got empty");
  });

  it("dateAdd shifts by v1 units plus hours/minutes", () => {
    expect(run('format(dateAdd(parseDate("2026-01-01"), 10, "days"))')).toBe(
      "2026-01-11"
    );
    expect(run('format(dateAdd(parseDate("2026-01-31"), 1, "months"))')).toBe(
      "2026-02-28"
    );
    expect(run('format(dateAdd(parseDate("2026-05-15"), 2, "years"))')).toBe(
      "2028-05-15"
    );
    expect(run('format(dateAdd(parseDate("2026-01-01"), -1, "days"))')).toBe(
      "2025-12-31"
    );
    expect(run('format(dateAdd(parseDate("2026-01-01"), 1, "day"))')).toBe(
      "2026-01-02"
    );
    expect(run('format(dateAdd(parseDate("2026-01-01"), 5, "hours"))')).toBe(
      "2026-01-01 05:00"
    );
    expect(run('format(dateAdd(parseDate("2026-01-01"), 90, "minutes"))')).toBe(
      "2026-01-01 01:30"
    );
  });

  it("dateAdd rejects bad input like v1", () => {
    expect(
      errorMessage(run('dateAdd(parseDate("2026-01-01"), 1, "weeks")'))
    ).toContain("unknown unit");
    expect(
      errorMessage(run('dateAdd(parseDate("2026-01-01"), "x", "days")'))
    ).toBe("dateAdd() expects a number, got text");
    expect(
      errorMessage(run('dateAdd(parseDate("2020-01-01"), 200000000, "days")'))
    ).toContain("out of range");
  });

  it("dateDiff computes signed calendar differences plus hours/minutes", () => {
    expect(
      run('dateDiff(parseDate("2026-01-10"), parseDate("2026-01-01"), "days")')
    ).toBe(9);
    expect(
      run('dateDiff(parseDate("2026-01-01"), parseDate("2026-01-10"), "days")')
    ).toBe(-9);
    expect(
      run(
        'dateDiff(parseDate("2026-03-01"), parseDate("2026-01-15"), "months")'
      )
    ).toBe(2);
    expect(
      run('dateDiff(parseDate("2030-01-01"), parseDate("2026-06-01"), "years")')
    ).toBe(4);
    expect(
      run('dateDiff(parseDate("2026-01-02"), parseDate("2026-01-01"), "hours")')
    ).toBe(24);
    expect(
      run(
        'dateDiff(parseDate("2026-01-01T10:30:00"), parseDate("2026-01-01T10:00:00"), "minutes")'
      )
    ).toBe(30);
  });

  it("extracts date parts with Monday-first weekdays", () => {
    expect(run('year(parseDate("2026-03-05"))')).toBe(2026);
    expect(run('month(parseDate("2026-03-05"))')).toBe(3);
    expect(run('day(parseDate("2026-03-05"))')).toBe(5);
    expect(run('weekday(parseDate("2026-03-02"))')).toBe(1);
    expect(run('weekday(parseDate("2026-03-05"))')).toBe(4);
    expect(run('weekday(parseDate("2026-03-08"))')).toBe(7);
    expect(run('hour(parseDate("2026-03-05"))')).toBe(0);
  });
});

describe("scope properties", () => {
  it("resolves values from the scope", () => {
    const scope = scopeOf({ Score: 10, Name: "Ada", Done: true, Empty: null });
    expect(run("thisPage.Score * 2", scope)).toBe(20);
    expect(run('thisRow.Name + "!"', scope)).toBe("Ada!");
    expect(run("thisPage.Done and true", scope)).toBe(true);
    expect(run("empty(thisPage.Empty)", scope)).toBe(true);
    expect(run('prop("Score") + 1', scope)).toBe(11);
  });

  it("returns scope-provided errors as values", () => {
    expect(errorMessage(run("thisPage.Nope"))).toBe('Unknown property "Nope"');
  });

  it("supports rich scope values (lists and dates)", () => {
    const scope = scopeOf({
      Tags: ["a", "b"],
      Due: new FormulaDate(new Date(2026, 2, 5), true),
    });
    expect(run("thisPage.Tags.length()", scope)).toBe(2);
    expect(run("year(thisPage.Due)", scope)).toBe(2026);
  });
});

describe("member access", () => {
  it("rejects non-row receivers with a typed error", () => {
    expect(errorMessage(run("let(r, 1, r.Estimate)"))).toBe(
      "Property access works on a row from a relation, got number"
    );
    expect(errorMessage(run('prop("x").owner', scopeOf({ x: "a" })))).toBe(
      "Property access works on a row from a relation, got text"
    );
  });

  it("points a list-of-rows receiver at .map", () => {
    const rel = [new FormulaRowRef("db-t", "r1")];
    expect(
      errorMessage(run('prop("Rel").Estimate', scopeOf({ Rel: rel })))
    ).toBe(
      'Use .map(r => r.Estimate) to read "Estimate" from each row of the list'
    );
  });

  it("propagates blank receivers as blank", () => {
    // first(<empty relation>) is blank; the chained member stays blank so
    // rollup chains over unlinked rows read empty, not error.
    expect(run('prop("Rel").first().Estimate', scopeOf({ Rel: [] }))).toBe(
      null
    );
  });

  it("resolves row members through the scope's relation resolver", () => {
    const scope: FormulaScope = {
      getProperty: () => new FormulaRowRef("db-t", "r1"),
      relations: {
        database: () => ({
          fields: [{ id: "f-est", name: "Estimate", type: "number" }],
          name: "Tasks",
          primaryFieldId: "f-est",
          row: (rowId) => (rowId === "r1" ? { "f-est": 8 } : null),
        }),
      },
    };
    expect(run('prop("row").Estimate', scope)).toBe(8);
    // Unknown member names error with the target database's name.
    expect(errorMessage(run('prop("row").Nope', scope))).toBe(
      '"Nope" isn\'t a property of Tasks'
    );
  });

  it("resolves bracket members through the same path as the dot form", () => {
    const scope: FormulaScope = {
      getProperty: () => new FormulaRowRef("db-t", "r1"),
      relations: {
        database: () => ({
          fields: [{ id: "f-pts", name: "Story Points", type: "number" }],
          name: "Tasks",
          primaryFieldId: "f-pts",
          row: (rowId) => (rowId === "r1" ? { "f-pts": 13 } : null),
        }),
      },
    };
    expect(run('prop("row")["Story Points"]', scope)).toBe(13);
    expect(errorMessage(run('prop("row")["Nope"]', scope))).toBe(
      '"Nope" isn\'t a property of Tasks'
    );
  });

  it("errors when a row ref reaches a scope without a resolver", () => {
    const scope = scopeOf({ row: new FormulaRowRef("db-t", "r1") });
    expect(errorMessage(run('prop("row").Estimate', scope))).toBe(
      "Related rows are not available here"
    );
  });
});

describe("whole-database references (db)", () => {
  /** Tasks (db-t): three rows with Estimate 2/5/8, the middle one Done. */
  function dbScope(): FormulaScope {
    const rows: Record<string, Record<string, string | number | boolean>> = {
      r1: { "f-done": false, "f-est": 2 },
      r2: { "f-done": true, "f-est": 5 },
      r3: { "f-done": false, "f-est": 8 },
    };
    return {
      getProperty: () => null,
      relations: {
        database: (databaseId) =>
          databaseId === "db-t"
            ? {
                fields: [
                  { id: "f-est", name: "Estimate", type: "number" },
                  { id: "f-done", name: "Done", type: "checkbox" },
                ],
                name: "Tasks",
                primaryFieldId: "f-est",
                row: (rowId) => rows[rowId] ?? null,
              }
            : null,
        rowIds: (databaseId) =>
          databaseId === "db-t" ? Object.keys(rows) : null,
      },
    };
  }

  it("evaluates to the target database's rows as a row-ref list", () => {
    const value = run('db("db-t")', dbScope());
    expect(value).toEqual([
      new FormulaRowRef("db-t", "r1"),
      new FormulaRowRef("db-t", "r2"),
      new FormulaRowRef("db-t", "r3"),
    ]);
    expect(run('db("db-t").length()', dbScope())).toBe(3);
  });

  it("composes with filter/map/member access like relation values", () => {
    const scope = dbScope();
    expect(run('db("db-t").map(r => r.Estimate).sum()', scope)).toBe(15);
    expect(run('db("db-t").filter(r => r.Done).length()', scope)).toBe(1);
    expect(run('db("db-t").first().Estimate', scope)).toBe(2);
    expect(run('db("db-t").filter(e => e.Estimate > 4).length()', scope)).toBe(
      2
    );
  });

  it("errors on an unknown database id, naming it", () => {
    expect(errorMessage(run('db("db-gone")', dbScope()))).toBe(
      '"db-gone" isn\'t a database'
    );
    // The error propagates through chains like any error value.
    expect(errorMessage(run('db("db-gone").length()', dbScope()))).toBe(
      '"db-gone" isn\'t a database'
    );
  });

  it("errors when no resolver (or no rowIds) is available", () => {
    expect(errorMessage(run('db("db-t")'))).toBe(
      "Database references are not available here"
    );
    const noEnumeration: FormulaScope = {
      getProperty: () => null,
      relations: { database: () => null },
    };
    expect(errorMessage(run('db("db-t")', noEnumeration))).toBe(
      "Database references are not available here"
    );
  });

  it("reads an empty database as the empty list, aggregating to zero", () => {
    const scope: FormulaScope = {
      getProperty: () => null,
      relations: {
        database: () => null,
        rowIds: (databaseId) => (databaseId === "db-empty" ? [] : null),
      },
    };
    expect(run('db("db-empty").length()', scope)).toBe(0);
    expect(run('db("db-empty").map(r => r.X).sum()', scope)).toBe(0);
  });

  it("still propagates receiver errors first", () => {
    expect(errorMessage(run("(1 / 0).digits"))).toBe("Division by zero");
  });
});

describe("clock injection", () => {
  it("defaults to the fixed epoch for determinism", () => {
    expect(run("year(now())")).toBe(2020);
    expect(run("now() == now()")).toBe(true);
    expect(run("format(today())")).toBe(
      dateFnsFormat(new Date(FORMULA_FIXED_NOW_ISO), "yyyy-MM-dd")
    );
  });

  it("reads the injected clock", () => {
    const scope: FormulaScope = {
      getProperty: () => null,
      // Local-time construction keeps assertions timezone-independent.
      now: () => new Date(2026, 6, 4, 8, 30),
    };
    expect(run('formatDate(now(), "yyyy-MM-dd HH:mm")', scope)).toBe(
      "2026-07-04 08:30"
    );
    expect(run("format(today())", scope)).toBe("2026-07-04");
  });

  it("composes with date math deterministically (v1 parity)", () => {
    const scope: FormulaScope = {
      getProperty: () => null,
      now: () => new Date(2026, 0, 31, 12),
    };
    expect(run('format(dateAdd(today(), 1, "months"))', scope)).toBe(
      "2026-02-28"
    );
  });

  it("rejects arguments to now() and today()", () => {
    expect(errorMessage(run("now(1)"))).toBe(
      "now() expects 0 arguments, got 1"
    );
  });
});

describe("isVolatileFormula", () => {
  function volatileOf(source: string): boolean {
    return isVolatileFormula(astOf(source));
  }

  it("detects now()/today() at any depth, method calls included", () => {
    expect(volatileOf("now()")).toBe(true);
    expect(volatileOf("NOW()")).toBe(true);
    expect(volatileOf("today()")).toBe(true);
    expect(volatileOf("if(true, now(), 1)")).toBe(true);
    expect(volatileOf('dateAdd(today(), 1, "days")')).toBe(true);
    expect(volatileOf("today().year()")).toBe(true);
    expect(volatileOf("[1].map(x => now())")).toBe(true);
  });

  it("reports pure formulas as non-volatile", () => {
    expect(volatileOf("1 + 2")).toBe(false);
    expect(volatileOf("thisPage.Due")).toBe(false);
    expect(volatileOf('concat("now()", "today")')).toBe(false);
    expect(volatileOf('parseDate("2026-01-01")')).toBe(false);
  });
});

describe("errors and the never-throw boundary", () => {
  it("errors on unknown functions like v1", () => {
    expect(errorMessage(run("nope(1)"))).toBe('Unknown function "nope"');
  });

  it("propagates the first argument error", () => {
    expect(errorMessage(run('concat("a", 1 / 0)'))).toBe("Division by zero");
    expect(errorMessage(run("[1, 1 / 0]"))).toBe("Division by zero");
  });

  it("resolves function names case-insensitively", () => {
    expect(run("ROUND(1.6)")).toBe(2);
    expect(run("Concat('a', 'b')")).toBe("ab");
  });

  it("returns an error value for unsupported hand-built nodes", () => {
    const bogus = {
      kind: "bogus",
      position: 0,
      end: 0,
    } as unknown as FormulaNode;
    expect(errorMessage(evaluateFormula(bogus, scopeOf()))).toBe(
      "Unsupported expression"
    );
  });

  it("catches internal exceptions at the boundary", () => {
    const throwingScope: FormulaScope = {
      getProperty: () => {
        throw new Error("scope blew up");
      },
    };
    expect(errorMessage(run("thisPage.X", throwingScope))).toBe(
      "Internal formula error: scope blew up"
    );
  });
});

describe("v1 golden corpus", () => {
  // The frozen v1 compatibility contract: `corpus.fixture.ts` carries each
  // retired catalog example with the display the v1 engine produced for it
  // (blank scope, fixed clock), captured before the v1 engine was deleted.
  const blankFormulaScope: FormulaScope = { getProperty: () => null };

  /**
   * Deliberate v2 divergences from the v1 engine, keyed by the frozen
   * corpus expression. Everything not listed here must display identically.
   */
  const DIVERGENCES = new Map<string, { expected: string; reason: string }>([
    [
      'formatDate(thisPage.Due, "MMM d")',
      {
        expected: "⚠ formatDate() expects a date, got empty",
        reason:
          "dates are a real value type in v2; text/blank no longer coerce inside the language (v1 said 'expects a date string')",
      },
    ],
    [
      'dateDiff(thisPage.Due, today(), "days")',
      {
        expected: "⚠ dateDiff() expects a date, got empty",
        reason: "same date-type strictness as formatDate",
      },
    ],
    [
      'dateDiff(thisPage.Due, today(), "days") < 7',
      {
        expected: "⚠ dateDiff() expects a date, got empty",
        reason: "same date-type strictness as formatDate",
      },
    ],
    [
      'formatDate(now(), "MMM d, HH:mm")',
      {
        // v1 truncated timestamps to their date part (midnight); v2 dates
        // carry real time-of-day, so HH:mm reflects the fixed instant.
        expected: dateFnsFormat(
          new Date(FORMULA_FIXED_NOW_ISO),
          "MMM d, HH:mm"
        ),
        reason: "v2 date values keep their time-of-day; v1 dropped it",
      },
    ],
  ]);

  for (const entry of V1_GOLDEN_CORPUS) {
    it(`matches the frozen v1 display for ${entry.expression}`, () => {
      const newDisplay = formulaValueToDisplay(
        run(entry.expression, blankFormulaScope)
      );
      const divergence = DIVERGENCES.get(entry.expression);
      if (divergence) {
        expect(newDisplay, divergence.reason).toBe(divergence.expected);
        expect(newDisplay).not.toBe(entry.expectedDisplay);
      } else {
        expect(newDisplay).toBe(entry.expectedDisplay);
      }
    });
  }
});
