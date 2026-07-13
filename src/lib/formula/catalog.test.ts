import { describe, expect, it } from "vitest";

import {
  FORMULA_FUNCTION_CATALOG,
  type FormulaFunctionEntry,
  formulaArityMessage,
  formulaFunctionForName,
  formulaFunctionMessageName,
  formulaMaxArgs,
  formulaMinArgs,
  VOLATILE_FORMULA_FUNCTION_NAMES,
} from "@/lib/formula/catalog.ts";
import { formulaValueToDisplay } from "@/lib/formula/display.ts";
import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import { type FormulaScope, isFormulaError } from "@/lib/formula/values.ts";

const BLANK_SCOPE: FormulaScope = { getProperty: () => null };

/** The locked stage-2 function set — additions/removals must be deliberate. */
const LOCKED_FUNCTION_SET = [
  // Logic
  "if",
  "switch",
  "and",
  "or",
  "not",
  "empty",
  // Math
  "abs",
  "ceil",
  "floor",
  "round",
  "sqrt",
  "mod",
  "min",
  "max",
  "sum",
  "average",
  // Text
  "concat",
  "len",
  "lower",
  "upper",
  "trim",
  "contains",
  "replace",
  "startsWith",
  "endsWith",
  "split",
  "format",
  // List
  "map",
  "filter",
  "find",
  "findIndex",
  "some",
  "every",
  "sort",
  "unique",
  "reverse",
  "flat",
  "first",
  "last",
  "at",
  "slice",
  "includes",
  "length",
  "join",
  "count",
  // Date / time
  "now",
  "today",
  "parseDate",
  "formatDate",
  "dateAdd",
  "dateDiff",
  "year",
  "month",
  "day",
  "weekday",
  "hour",
  "minute",
];

describe("catalog function set", () => {
  it("contains exactly the locked stage-2 set", () => {
    const names = FORMULA_FUNCTION_CATALOG.map((entry) => entry.name).sort();
    expect(names).toEqual([...LOCKED_FUNCTION_SET].sort());
  });

  it("has unique names and aliases", () => {
    const seen = new Set<string>();
    for (const entry of FORMULA_FUNCTION_CATALOG) {
      for (const name of [entry.name, ...(entry.aliases ?? [])]) {
        const lower = name.toLowerCase();
        expect(seen.has(lower), name).toBe(false);
        seen.add(lower);
      }
    }
  });

  it("resolves names and aliases case-insensitively", () => {
    expect(formulaFunctionForName("ROUND")?.name).toBe("round");
    expect(formulaFunctionForName("avg")?.name).toBe("average");
    expect(formulaFunctionForName("FormatDate")?.name).toBe("formatDate");
    expect(formulaFunctionForName("nope")).toBeUndefined();
  });

  it("flags exactly now and today as volatile", () => {
    expect([...VOLATILE_FORMULA_FUNCTION_NAMES].sort()).toEqual([
      "now",
      "today",
    ]);
  });
});

describe("catalog docs discipline", () => {
  for (const entry of FORMULA_FUNCTION_CATALOG) {
    it(`${entry.name} has a description and at least one example`, () => {
      expect(entry.description.length).toBeGreaterThan(10);
      expect(entry.examples.length).toBeGreaterThan(0);
    });

    it(`${entry.name} examples parse and evaluate without error`, () => {
      for (const example of entry.examples) {
        const parsed = parseFormula(example);
        expect(parsed.ok, `${entry.name}: ${example}`).toBe(true);
        if (!parsed.ok) {
          continue;
        }
        const value = evaluateFormula(parsed.ast, BLANK_SCOPE);
        expect(
          isFormulaError(value),
          `${entry.name}: ${example} → ${formulaValueToDisplay(value)}`
        ).toBe(false);
      }
    });

    it(`${entry.name} examples use the documented function`, () => {
      for (const example of entry.examples) {
        expect(example.toLowerCase()).toContain(`${entry.name.toLowerCase()}(`);
      }
    });
  }
});

describe("catalog signature discipline", () => {
  for (const entry of FORMULA_FUNCTION_CATALOG) {
    it(`${entry.name} has consistent laziness`, () => {
      const anyLazy = entry.params.some((param) => param.lazy);
      const allLazy = entry.params.every((param) => param.lazy);
      if (entry.kind === "lazy") {
        expect(entry.params.length).toBeGreaterThan(0);
        expect(allLazy).toBe(true);
      } else {
        expect(anyLazy).toBe(false);
      }
    });

    it(`${entry.name} keeps variadic last and optionals trailing`, () => {
      const params = entry.params;
      for (const [index, param] of params.entries()) {
        if (param.variadic) {
          expect(index).toBe(params.length - 1);
        }
        if (param.optional && index < params.length - 1) {
          // Everything after an optional param must be optional too.
          expect(params[index + 1].optional).toBe(true);
        }
      }
    });
  }
});

describe("arity helpers", () => {
  function entryOf(name: string): FormulaFunctionEntry {
    const entry = formulaFunctionForName(name);
    if (!entry) {
      throw new Error(`missing entry ${name}`);
    }
    return entry;
  }

  it("derives min/max from the signature", () => {
    expect(formulaMinArgs(entryOf("round"))).toBe(1);
    expect(formulaMaxArgs(entryOf("round"))).toBe(2);
    expect(formulaMinArgs(entryOf("now"))).toBe(0);
    expect(formulaMaxArgs(entryOf("now"))).toBe(0);
    expect(formulaMinArgs(entryOf("max"))).toBe(1);
    expect(formulaMaxArgs(entryOf("max"))).toBe(Number.POSITIVE_INFINITY);
    expect(formulaMinArgs(entryOf("if"))).toBe(2);
    expect(formulaMaxArgs(entryOf("if"))).toBe(3);
    expect(formulaMinArgs(entryOf("switch"))).toBe(3);
    expect(formulaMinArgs(entryOf("and"))).toBe(2);
  });

  it("formats v1-shaped arity messages", () => {
    expect(formulaArityMessage("now", entryOf("now"), 1)).toBe(
      "now() expects 0 arguments, got 1"
    );
    expect(formulaArityMessage("round", entryOf("round"), 0)).toBe(
      "round() expects 1 to 2 arguments, got 0"
    );
    expect(formulaArityMessage("max", entryOf("max"), 0)).toBe(
      "max() expects at least 1 argument(s), got 0"
    );
    expect(formulaArityMessage("abs", entryOf("abs"), 2)).toBe(
      "abs() expects 1 argument, got 2"
    );
  });

  it("resolves the documented casing for messages", () => {
    expect(
      formulaFunctionMessageName(entryOf("formatDate"), "formatdate")
    ).toBe("formatDate");
    expect(formulaFunctionMessageName(entryOf("average"), "avg")).toBe("avg");
    expect(formulaFunctionMessageName(entryOf("average"), "average")).toBe(
      "average"
    );
  });
});
