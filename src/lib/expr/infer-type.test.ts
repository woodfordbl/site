import { describe, expect, it } from "vitest";

import { type ExprType, inferType } from "@/lib/expr/infer-type.ts";
import { parseExpression } from "@/lib/expr/parse.ts";

/** Field-type table for `thisPage.X` references in these tests. */
const FIELD_TYPES: Record<string, ExprType> = {
  Price: "number",
  Name: "text",
  Done: "boolean",
  Due: "date",
  Notes: "text",
};

function typeOf(source: string): ExprType {
  const parsed = parseExpression(source);
  if (!parsed.ok) {
    throw new Error(`parse failed: ${parsed.error.message}`);
  }
  return inferType(parsed.ast, (name) => FIELD_TYPES[name] ?? "unknown");
}

describe("inferType", () => {
  it("types literals", () => {
    expect(typeOf("42")).toBe("number");
    expect(typeOf('"hi"')).toBe("text");
    expect(typeOf("true")).toBe("boolean");
    expect(typeOf("null")).toBe("empty");
  });

  it("resolves property types, unknown when absent", () => {
    expect(typeOf("thisPage.Price")).toBe("number");
    expect(typeOf("thisPage.Name")).toBe("text");
    expect(typeOf("thisPage.Due")).toBe("date");
    expect(typeOf("thisPage.Missing")).toBe("unknown");
  });

  it("types arithmetic, concat, and comparisons", () => {
    expect(typeOf("thisPage.Price * 2")).toBe("number");
    expect(typeOf("1 - 2")).toBe("number");
    expect(typeOf('thisPage.Name + "!"')).toBe("text");
    expect(typeOf('"x" + 1')).toBe("text");
    expect(typeOf("1 + 2")).toBe("number");
    expect(typeOf("thisPage.Price > 10")).toBe("boolean");
    expect(typeOf("thisPage.Done and true")).toBe("boolean");
    expect(typeOf("not thisPage.Done")).toBe("boolean");
    expect(typeOf("-thisPage.Price")).toBe("number");
  });

  it("types functions by their result", () => {
    expect(typeOf("round(thisPage.Price, 2)")).toBe("number");
    expect(typeOf("upper(thisPage.Name)")).toBe("text");
    expect(typeOf('contains(thisPage.Name, "x")')).toBe("boolean");
    expect(typeOf('dateAdd(thisPage.Due, 1, "days")')).toBe("date");
    expect(typeOf("year(thisPage.Due)")).toBe("number");
    expect(typeOf("today()")).toBe("date");
    expect(typeOf("len(thisPage.Name)")).toBe("number");
  });

  it("unifies branch results of if / ifs / switch", () => {
    expect(typeOf('if(thisPage.Done, "a", "b")')).toBe("text");
    expect(typeOf("if(thisPage.Done, 1, 2)")).toBe("number");
    // Mixed branch types widen to unknown.
    expect(typeOf('if(thisPage.Done, 1, "b")')).toBe("unknown");
    // An empty (null) branch unifies with the concrete branch.
    expect(typeOf("if(thisPage.Done, thisPage.Price, null)")).toBe("number");
    expect(typeOf('ifs(thisPage.Done, "a", "b")')).toBe("text");
    expect(typeOf('switch(thisPage.Name, "x", 1, 2)')).toBe("number");
  });

  it("types let/lets by their body and formatters as text", () => {
    expect(typeOf("let(x, thisPage.Price, x * 2)")).toBe("number");
    expect(typeOf("lets(a, thisPage.Name, b, 2, a)")).toBe("unknown");
    expect(typeOf("currency(thisPage.Price)")).toBe("text");
    expect(typeOf("compact(thisPage.Price)")).toBe("text");
    expect(typeOf("toDate(thisPage.Notes)")).toBe("date");
    expect(typeOf("toBoolean(thisPage.Notes)")).toBe("boolean");
  });

  it("types list literals and list operations", () => {
    expect(typeOf("[1, 2, 3]")).toBe("list");
    expect(typeOf("count(thisPage.Tags)")).toBe("number");
    expect(typeOf("countIf(thisPage.Scores, current > 80)")).toBe("number");
    expect(typeOf("filter([1, 2], current > 1)")).toBe("list");
    expect(typeOf("map([1, 2], current * 2)")).toBe("list");
    expect(typeOf('join([1, 2], ",")')).toBe("text");
    expect(typeOf("some([1, 2], current > 1)")).toBe("boolean");
  });

  it("is unknown for bare variables and unknown functions", () => {
    expect(typeOf("current")).toBe("unknown");
    expect(typeOf("mystery(1)")).toBe("unknown");
  });
});
