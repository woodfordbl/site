import { describe, expect, it } from "vitest";

import {
  EXPR_FIXED_NOW_ISO,
  type ExprScope,
  type ExprValue,
  evaluateExpression,
  exprError,
  isExprError,
  isVolatileExpression,
} from "@/lib/expr/evaluate.ts";
import { parseExpression } from "@/lib/expr/parse.ts";

/** Scope over a plain record; unknown names produce an error value. */
function scopeOf(properties: Record<string, ExprValue> = {}): ExprScope {
  return {
    getProperty: (name) =>
      name in properties
        ? properties[name]
        : exprError(`Unknown property "${name}"`),
  };
}

function run(source: string, scope: ExprScope = scopeOf()): ExprValue {
  const parsed = parseExpression(source);
  if (!parsed.ok) {
    throw new Error(
      `parse failed for ${JSON.stringify(source)}: ${parsed.error.message}`
    );
  }
  return evaluateExpression(parsed.ast, scope);
}

function errorMessage(value: ExprValue): string {
  if (!isExprError(value)) {
    throw new Error(`expected an ExprError, got ${JSON.stringify(value)}`);
  }
  return value.message;
}

describe("arithmetic", () => {
  it("evaluates the basics", () => {
    expect(run("1 + 2")).toBe(3);
    expect(run("2 * 3 + 4")).toBe(10);
    expect(run("10 / 4")).toBe(2.5);
    expect(run("7 % 3")).toBe(1);
    expect(run("-(2 + 3)")).toBe(-5);
    expect(run("2 * (3 + 4)")).toBe(14);
  });

  it("concatenates when either side of + is a string", () => {
    expect(run('"a" + "b"')).toBe("ab");
    expect(run('"a" + 1')).toBe("a1");
    expect(run('1 + "a"')).toBe("1a");
    expect(run('"is " + true')).toBe("is true");
    expect(run('null + "x"')).toBe("x");
  });

  it("errors on non-numeric arithmetic", () => {
    expect(errorMessage(run("null + 1"))).toBe("Cannot add empty and number");
    expect(errorMessage(run('"5" * 2'))).toContain('Cannot apply "*"');
    expect(errorMessage(run("true - 1"))).toContain('Cannot apply "-"');
  });

  it("errors on division by zero", () => {
    expect(errorMessage(run("1 / 0"))).toBe("Division by zero");
    expect(errorMessage(run("5 % 0"))).toBe("Division by zero");
    expect(errorMessage(run("0 / 0"))).toBe("Division by zero");
  });

  it("errors when negating a non-number", () => {
    expect(errorMessage(run('-"a"'))).toBe("Cannot negate text");
  });
});

describe("comparisons", () => {
  it("compares numbers", () => {
    expect(run("1 < 2")).toBe(true);
    expect(run("2 <= 2")).toBe(true);
    expect(run("3 > 4")).toBe(false);
    expect(run("4 >= 5")).toBe(false);
  });

  it("compares strings lexically", () => {
    expect(run('"a" < "b"')).toBe(true);
    expect(run('"a" <= "a"')).toBe(true);
    expect(run('"b" > "ba"')).toBe(false);
  });

  it("compares ISO date strings correctly via lexical order", () => {
    expect(run('"2024-01-05" < "2024-02-01"')).toBe(true);
    expect(run('"2024-12-31" >= "2024-12-31"')).toBe(true);
    expect(run('"2023-11-30" > "2024-01-01"')).toBe(false);
  });

  it("errors on mixed-type ordering", () => {
    expect(errorMessage(run('1 < "a"'))).toBe("Cannot compare number and text");
    expect(errorMessage(run("true > 0"))).toBe(
      "Cannot compare boolean and number"
    );
    expect(errorMessage(run("null < 1"))).toBe(
      "Cannot compare empty and number"
    );
  });

  it("evaluates type-aware equality", () => {
    expect(run("1 == 1")).toBe(true);
    expect(run('"x" != "y"')).toBe(true);
    expect(run("true == true")).toBe(true);
    expect(run("null == null")).toBe(true);
    expect(run("null != null")).toBe(false);
  });

  it("treats mismatched equality types as unequal, not an error", () => {
    expect(run('1 == "1"')).toBe(false);
    expect(run("null == 0")).toBe(false);
    expect(run('null != "x"')).toBe(true);
    expect(run("true == 1")).toBe(false);
  });
});

describe("logic", () => {
  it("evaluates and/or/not", () => {
    expect(run("true and false")).toBe(false);
    expect(run("true and true")).toBe(true);
    expect(run("false or true")).toBe(true);
    expect(run("false or false")).toBe(false);
    expect(run("not true")).toBe(false);
    expect(run("!false")).toBe(true);
    expect(run("true && false || true")).toBe(true);
  });

  it("short-circuits and — the right side never runs", () => {
    expect(run("false and (1 / 0 == 0)")).toBe(false);
  });

  it("short-circuits or — the right side never runs", () => {
    expect(run("true or (1 / 0 == 0)")).toBe(true);
  });

  it("errors on non-boolean operands", () => {
    expect(errorMessage(run("1 and true"))).toContain("expects a boolean");
    expect(errorMessage(run('false or "x"'))).toContain("expects a boolean");
    expect(errorMessage(run("not 1"))).toContain("expects a boolean");
  });
});

describe("error propagation", () => {
  it("propagates through binary operators", () => {
    expect(errorMessage(run("(1 / 0) + 5"))).toBe("Division by zero");
    expect(errorMessage(run("5 - 1 / 0"))).toBe("Division by zero");
    expect(errorMessage(run("(1 / 0) == 1"))).toBe("Division by zero");
  });

  it("propagates through unary operators", () => {
    expect(errorMessage(run("-(1 / 0)"))).toBe("Division by zero");
  });

  it("propagates through function arguments", () => {
    expect(errorMessage(run('concat("a", 1 / 0)'))).toBe("Division by zero");
    expect(errorMessage(run("abs(1 % 0)"))).toBe("Division by zero");
  });

  it("propagates unknown properties outward", () => {
    expect(errorMessage(run("thisPage.Missing + 1"))).toBe(
      'Unknown property "Missing"'
    );
  });

  it("errors on unknown functions", () => {
    expect(errorMessage(run("nope(1)"))).toBe('Unknown function "nope"');
  });
});

describe("if", () => {
  it("returns the taken branch", () => {
    expect(run("if(true, 1, 2)")).toBe(1);
    expect(run("if(false, 1, 2)")).toBe(2);
    expect(run('if(1 < 2, "yes", "no")')).toBe("yes");
  });

  it("is lazy — the untaken branch never evaluates", () => {
    expect(run("if(true, 1, 1 / 0)")).toBe(1);
    expect(run("if(false, 1 / 0, 2)")).toBe(2);
  });

  it("guards a division like a spreadsheet would", () => {
    expect(run("if(2 != 0, 10 / 2, 0)")).toBe(5);
    expect(run("if(0 != 0, 10 / 0, 0)")).toBe(0);
  });

  it("errors on a non-boolean condition", () => {
    expect(errorMessage(run("if(1, 2, 3)"))).toContain("expects a boolean");
  });

  it("propagates condition errors", () => {
    expect(errorMessage(run("if(1 / 0 == 0, 1, 2)"))).toBe("Division by zero");
  });

  it("errors on wrong arity", () => {
    expect(errorMessage(run("if(true, 1)"))).toBe(
      "if() expects 3 arguments, got 2"
    );
  });
});

describe("functions", () => {
  it("resolves names case-insensitively", () => {
    expect(run("ROUND(1.6)")).toBe(2);
    expect(run("Concat('a', 'b')")).toBe("ab");
    expect(run("LOWER('AB')")).toBe("ab");
  });

  it("concat coerces every argument", () => {
    expect(run('concat("a", 1, true, null, "b")')).toBe("a1trueb");
  });

  it("round works with and without digits", () => {
    expect(run("round(3.456)")).toBe(3);
    expect(run("round(3.5)")).toBe(4);
    expect(run("round(3.456, 2)")).toBe(3.46);
    expect(run("round(3.444, 1)")).toBe(3.4);
  });

  it("round rejects non-numbers and bad arity", () => {
    expect(errorMessage(run('round("x")'))).toBe(
      "round() expects a number, got text"
    );
    expect(errorMessage(run("round()"))).toBe(
      "round() expects 1 to 2 arguments, got 0"
    );
    expect(errorMessage(run("round(1, 2, 3)"))).toBe(
      "round() expects 1 to 2 arguments, got 3"
    );
  });

  it("floor / ceil / abs", () => {
    expect(run("floor(3.7)")).toBe(3);
    expect(run("ceil(3.1)")).toBe(4);
    expect(run("abs(-2.5)")).toBe(2.5);
    expect(errorMessage(run("floor(null)"))).toBe(
      "floor() expects a number, got empty"
    );
  });

  it("min / max are variadic", () => {
    expect(run("min(3, 1, 2)")).toBe(1);
    expect(run("max(3, 1, 2)")).toBe(3);
    expect(run("min(5)")).toBe(5);
    expect(errorMessage(run('min(1, "a")'))).toBe(
      "min() expects a number, got text"
    );
    expect(errorMessage(run("max()"))).toBe(
      "max() expects at least 1 argument(s), got 0"
    );
  });

  it("sum / average are variadic", () => {
    expect(run("sum(1, 2, 3)")).toBe(6);
    expect(run("sum(5)")).toBe(5);
    expect(run("average(2, 4, 6)")).toBe(4);
    expect(run("average(5)")).toBe(5);
  });

  it("avg is an alias for average", () => {
    expect(run("avg(2, 4)")).toBe(3);
    expect(errorMessage(run("avg(true)"))).toBe(
      "avg() expects a number, got boolean"
    );
  });

  it("sum / average reject non-numbers like min/max (no string coercion)", () => {
    expect(errorMessage(run('sum(1, "2")'))).toBe(
      "sum() expects a number, got text"
    );
    expect(errorMessage(run("average(1, null)"))).toBe(
      "average() expects a number, got empty"
    );
  });

  it("sum / average error on empty argument lists", () => {
    expect(errorMessage(run("sum()"))).toBe(
      "sum() expects at least 1 argument(s), got 0"
    );
    expect(errorMessage(run("average()"))).toBe(
      "average() expects at least 1 argument(s), got 0"
    );
  });

  it("sum / average propagate argument errors", () => {
    expect(errorMessage(run("sum(1, 1 / 0)"))).toBe("Division by zero");
    expect(errorMessage(run("average(1, thisPage.Nope)"))).toBe(
      'Unknown property "Nope"'
    );
  });

  it("len coerces its argument to text", () => {
    expect(run('len("abc")')).toBe(3);
    expect(run("len(null)")).toBe(0);
    expect(run("len(42)")).toBe(2);
  });

  it("lower / upper / trim", () => {
    expect(run('lower("AbC")')).toBe("abc");
    expect(run('upper("AbC")')).toBe("ABC");
    expect(run('trim("  x  ")')).toBe("x");
  });

  it("contains is case-sensitive", () => {
    expect(run('contains("hello", "ell")')).toBe(true);
    expect(run('contains("hello", "ELL")')).toBe(false);
    expect(run('contains("hello", "")')).toBe(true);
  });

  it("replace replaces all occurrences of a literal substring", () => {
    expect(run('replace("a-b-c", "-", "+")')).toBe("a+b+c");
    expect(run('replace("aaa", "a", "b")')).toBe("bbb");
    expect(run('replace("abc", "x", "y")')).toBe("abc");
  });

  it("empty matches cell emptiness semantics", () => {
    expect(run("empty(null)")).toBe(true);
    expect(run('empty("")')).toBe(true);
    expect(run('empty("   ")')).toBe(true);
    expect(run('empty("x")')).toBe(false);
    expect(run("empty(0)")).toBe(false);
    expect(run("empty(false)")).toBe(false);
  });

  it("format applies the field-agnostic display default", () => {
    expect(run("format(1234.5)")).toBe("1,234.5");
    expect(run("format(true)")).toBe("Yes");
    expect(run("format(false)")).toBe("No");
    expect(run("format(null)")).toBe("");
    expect(run('format("x")')).toBe("x");
  });

  it("formatDate renders via date-fns", () => {
    expect(run('formatDate("2026-03-05", "MMM d")')).toBe("Mar 5");
    expect(run('formatDate("2026-03-05", "yyyy")')).toBe("2026");
  });

  it("formatDate accepts full ISO timestamps", () => {
    expect(run('formatDate("2026-03-05T10:30:00Z", "MMM d, yyyy")')).toBe(
      "Mar 5, 2026"
    );
  });

  it("formatDate rejects invalid dates and patterns", () => {
    expect(errorMessage(run('formatDate("not a date", "MMM d")'))).toContain(
      "invalid date"
    );
    expect(errorMessage(run('formatDate("2026-03-05", "bogus-x")'))).toContain(
      "invalid format pattern"
    );
  });

  it("dateAdd shifts by days, months, and years", () => {
    expect(run('dateAdd("2026-01-01", 10, "days")')).toBe("2026-01-11");
    expect(run('dateAdd("2026-01-31", 1, "months")')).toBe("2026-02-28");
    expect(run('dateAdd("2026-05-15", 2, "years")')).toBe("2028-05-15");
    expect(run('dateAdd("2026-01-01", -1, "days")')).toBe("2025-12-31");
  });

  it("dateAdd accepts singular unit names", () => {
    expect(run('dateAdd("2026-01-01", 1, "day")')).toBe("2026-01-02");
  });

  it("dateAdd rejects bad input", () => {
    expect(errorMessage(run('dateAdd("nope", 1, "days")'))).toContain(
      "invalid date"
    );
    expect(errorMessage(run('dateAdd("2026-01-01", 1, "weeks")'))).toContain(
      "unknown unit"
    );
    expect(errorMessage(run('dateAdd("2026-01-01", "x", "days")'))).toContain(
      "expects a number"
    );
  });

  it("dateDiff computes signed calendar differences", () => {
    expect(run('dateDiff("2026-01-10", "2026-01-01", "days")')).toBe(9);
    expect(run('dateDiff("2026-01-01", "2026-01-10", "days")')).toBe(-9);
    expect(run('dateDiff("2026-03-01", "2026-01-15", "months")')).toBe(2);
    expect(run('dateDiff("2030-01-01", "2026-06-01", "years")')).toBe(4);
  });

  it("nests happily", () => {
    expect(run('upper(concat("a", "b")) + format(2)')).toBe("AB2");
    expect(run("round(abs(-3.456), 1)")).toBe(3.5);
  });
});

describe("scope properties", () => {
  it("resolves values from the scope", () => {
    const scope = scopeOf({ Score: 10, Name: "Ada", Done: true, Empty: null });
    expect(run("thisPage.Score * 2", scope)).toBe(20);
    expect(run('thisRow.Name + "!"', scope)).toBe("Ada!");
    expect(run("thisPage.Done and true", scope)).toBe(true);
    expect(run("empty(thisPage.Empty)", scope)).toBe(true);
  });

  it("returns scope-provided errors as values", () => {
    expect(errorMessage(run("thisPage.Nope"))).toBe('Unknown property "Nope"');
  });
});

describe("clock injection", () => {
  it("now() defaults to the fixed epoch for determinism", () => {
    expect(run("now()")).toBe(EXPR_FIXED_NOW_ISO);
  });

  it("now() twice in one expression is consistent under the fixed clock", () => {
    expect(run("now() == now()")).toBe(true);
  });

  it("now() reads the injected clock", () => {
    const scope: ExprScope = {
      getProperty: () => null,
      now: () => new Date("2026-07-04T08:30:00.000Z"),
    };
    expect(run("now()", scope)).toBe("2026-07-04T08:30:00.000Z");
  });

  it("today() reports the local calendar date of the injected instant", () => {
    const scope: ExprScope = {
      getProperty: () => null,
      // Local-time construction keeps this assertion timezone-independent.
      now: () => new Date(2026, 5, 15, 12, 0, 0),
    };
    expect(run("today()", scope)).toBe("2026-06-15");
  });

  it("today() composes with date math deterministically", () => {
    const scope: ExprScope = {
      getProperty: () => null,
      now: () => new Date(2026, 0, 31, 12),
    };
    expect(run('dateAdd(today(), 1, "months")', scope)).toBe("2026-02-28");
  });

  it("now() and today() reject arguments", () => {
    expect(errorMessage(run("now(1)"))).toBe(
      "now() expects 0 arguments, got 1"
    );
  });
});

describe("isVolatileExpression", () => {
  function volatileOf(source: string): boolean {
    const parsed = parseExpression(source);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    return isVolatileExpression(parsed.ast);
  }

  it("detects now() and today() at any depth", () => {
    expect(volatileOf("now()")).toBe(true);
    expect(volatileOf("today()")).toBe(true);
    expect(volatileOf("NOW()")).toBe(true);
    expect(volatileOf("if(true, now(), 1)")).toBe(true);
    expect(volatileOf('dateAdd(today(), 1, "days")')).toBe(true);
    expect(volatileOf("-(1 + len(now()))")).toBe(true);
    expect(volatileOf('today() == "2026-01-01" or false')).toBe(true);
  });

  it("reports pure expressions as non-volatile", () => {
    expect(volatileOf("1 + 2")).toBe(false);
    expect(volatileOf("thisPage.Due")).toBe(false);
    expect(volatileOf('formatDate("2026-01-01", "MMM d")')).toBe(false);
    expect(volatileOf('concat("now()", "today")')).toBe(false);
  });
});

describe("date function range guards", () => {
  it("dateAdd returns an error value for amounts that push the date out of range", () => {
    // Beyond the ECMAScript ±8.64e15 ms date range date-fns produces an
    // Invalid Date; formatting it would throw RangeError.
    expect(
      errorMessage(run('dateAdd("2020-01-01", 200000000, "days")'))
    ).toContain("out of range");
    expect(
      errorMessage(run('dateAdd("2020-01-01", -200000000, "days")'))
    ).toContain("out of range");
    expect(
      errorMessage(run('dateAdd("2020-01-01", 999999999, "years")'))
    ).toContain("out of range");
  });

  it("dateAdd still works at large-but-valid offsets", () => {
    expect(run('dateAdd("2020-01-01", 3650, "days")')).toBe("2029-12-29");
  });
});
