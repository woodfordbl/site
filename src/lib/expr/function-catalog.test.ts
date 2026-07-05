import { describe, expect, it } from "vitest";

import { implementedExprFunctionNames } from "@/lib/expr/evaluate.ts";
import {
  EXPR_FUNCTION_CATALOG,
  EXPR_OPERATOR_CATALOG,
  formulaPropertyReference,
} from "@/lib/expr/function-catalog.ts";
import { parseExpression } from "@/lib/expr/parse.ts";

describe("EXPR_FUNCTION_CATALOG", () => {
  it("documents exactly the implemented function set (aliases included)", () => {
    const documented = new Set<string>();
    for (const entry of EXPR_FUNCTION_CATALOG) {
      documented.add(entry.name.toLowerCase());
      for (const alias of entry.aliases ?? []) {
        documented.add(alias.toLowerCase());
      }
    }
    const implemented = new Set(implementedExprFunctionNames());
    // Set equality both ways so drift fails loudly with the missing name.
    expect([...documented].sort()).toEqual([...implemented].sort());
  });

  it("has unique canonical names", () => {
    const names = EXPR_FUNCTION_CATALOG.map((entry) =>
      entry.name.toLowerCase()
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("every example parses", () => {
    for (const entry of EXPR_FUNCTION_CATALOG) {
      const parsed = parseExpression(entry.example);
      expect(parsed.ok, `${entry.name} example: ${entry.example}`).toBe(true);
    }
  });

  it("every signature starts with the canonical name and an open paren", () => {
    for (const entry of EXPR_FUNCTION_CATALOG) {
      expect(entry.signature.startsWith(`${entry.name}(`)).toBe(true);
    }
  });

  it("every example uses the documented function", () => {
    for (const entry of EXPR_FUNCTION_CATALOG) {
      expect(entry.example.toLowerCase()).toContain(
        `${entry.name.toLowerCase()}(`
      );
    }
  });
});

describe("EXPR_OPERATOR_CATALOG", () => {
  it("every operator parses in a minimal expression", () => {
    for (const entry of EXPR_OPERATOR_CATALOG) {
      let source: string;
      if (entry.symbol === "not") {
        source = "not true";
      } else if (entry.category === "logic") {
        source = `true ${entry.symbol} false`;
      } else {
        source = `1 ${entry.symbol} 2`;
      }
      const parsed = parseExpression(source);
      expect(parsed.ok, `operator ${entry.symbol}: ${source}`).toBe(true);
    }
  });

  it("covers arithmetic, comparison, and logic groups", () => {
    const byCategory = new Map<string, number>();
    for (const entry of EXPR_OPERATOR_CATALOG) {
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1);
    }
    expect(byCategory.get("arithmetic")).toBe(5);
    expect(byCategory.get("comparison")).toBe(6);
    expect(byCategory.get("logic")).toBe(3);
  });
});

describe("formulaPropertyReference", () => {
  it("uses dot form for bare identifiers", () => {
    expect(formulaPropertyReference("Price")).toBe("Page.Price");
    expect(formulaPropertyReference("_x2")).toBe("Page._x2");
  });

  it("uses the escaped bracket form otherwise", () => {
    expect(formulaPropertyReference("Unit Price")).toBe('Page["Unit Price"]');
    expect(formulaPropertyReference('Say "hi"')).toBe('Page["Say \\"hi\\""]');
    expect(formulaPropertyReference("a\\b")).toBe('Page["a\\\\b"]');
    expect(formulaPropertyReference("1st")).toBe('Page["1st"]');
  });

  it("always produces a parseable property reference", () => {
    for (const name of ["Price", "Unit Price", 'Say "hi"', "a\\b", "1st"]) {
      const parsed = parseExpression(formulaPropertyReference(name));
      expect(parsed.ok, `reference for ${name}`).toBe(true);
      if (parsed.ok) {
        expect(parsed.ast).toEqual(
          expect.objectContaining({ kind: "property", name })
        );
      }
    }
  });
});
