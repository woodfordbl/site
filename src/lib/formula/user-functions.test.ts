import { describe, expect, it } from "vitest";

import {
  formulaUserFunctionNameError,
  formulaUserFunctionParamsError,
  formulaUserFunctionSignature,
  prepareUserFunctions,
} from "@/lib/formula/user-functions.ts";

describe("formulaUserFunctionNameError", () => {
  it("accepts identifier-safe unused names", () => {
    expect(formulaUserFunctionNameError("weightedScore")).toBeNull();
    expect(formulaUserFunctionNameError("score_v2")).toBeNull();
    expect(formulaUserFunctionNameError("_internal")).toBeNull();
  });

  it("rejects empty and non-identifier names", () => {
    expect(formulaUserFunctionNameError("")).toContain("can't be empty");
    expect(formulaUserFunctionNameError("   ")).toContain("can't be empty");
    expect(formulaUserFunctionNameError("my score")).toContain(
      "isn't a valid function name"
    );
    expect(formulaUserFunctionNameError("2fast")).toContain(
      "isn't a valid function name"
    );
    expect(formulaUserFunctionNameError("a-b")).toContain(
      "isn't a valid function name"
    );
    expect(formulaUserFunctionNameError('x"y')).toContain(
      "isn't a valid function name"
    );
  });

  it("rejects the grammar's reserved words case-insensitively", () => {
    for (const word of ["true", "False", "null", "AND", "or", "not"]) {
      expect(formulaUserFunctionNameError(word)).toContain("is reserved");
    }
  });

  it("rejects the reference roots and evaluator special forms", () => {
    for (const word of ["prop", "db", "thisPage", "thisrow", "let", "lets"]) {
      expect(formulaUserFunctionNameError(word)).toContain("is reserved");
    }
  });

  it("rejects catalog function names and aliases case-insensitively", () => {
    expect(formulaUserFunctionNameError("round")).toContain(
      "already a built-in"
    );
    expect(formulaUserFunctionNameError("ROUND")).toContain(
      "already a built-in"
    );
    // `avg` is an alias of `average` — aliases collide too.
    expect(formulaUserFunctionNameError("avg")).toContain("already a built-in");
    expect(formulaUserFunctionNameError("if")).toContain("already a built-in");
  });

  it("rejects taken names case-insensitively, skipping the exclusion", () => {
    expect(formulaUserFunctionNameError("myFn", ["other", "MYFN"])).toContain(
      "already exists"
    );
    expect(formulaUserFunctionNameError("myFn", ["other"])).toBeNull();
  });
});

describe("formulaUserFunctionParamsError", () => {
  it("accepts identifier params, including catalog-name shadows", () => {
    expect(formulaUserFunctionParamsError(["points", "weight"])).toBeNull();
    // Lambda params may shadow catalog names; user-fn params follow suit.
    expect(formulaUserFunctionParamsError(["round"])).toBeNull();
    expect(formulaUserFunctionParamsError([])).toBeNull();
  });

  it("rejects non-identifiers, reserved words, and roots", () => {
    expect(formulaUserFunctionParamsError(["a b"])).toContain(
      "isn't a valid parameter name"
    );
    expect(formulaUserFunctionParamsError(["not"])).toContain("is reserved");
    expect(formulaUserFunctionParamsError(["prop"])).toContain("is reserved");
    expect(formulaUserFunctionParamsError(["thisRow"])).toContain(
      "is reserved"
    );
  });

  it("rejects exact duplicates, allowing case variants (grammar rule)", () => {
    expect(formulaUserFunctionParamsError(["a", "b", "a"])).toContain(
      'Duplicate parameter name "a"'
    );
    expect(formulaUserFunctionParamsError(["a", "A"])).toBeNull();
  });
});

describe("prepareUserFunctions", () => {
  it("parses each body once and keys by lowercased name", () => {
    const prepared = prepareUserFunctions([
      { expression: "x * 2", name: "Double", params: ["x"] },
    ]);
    const def = prepared.get("double");
    expect(def?.name).toBe("Double");
    expect(def?.body?.kind).toBe("binary");
    expect(def?.bodyError).toBeNull();
  });

  it("keeps the parse error for unparseable and blank bodies", () => {
    const prepared = prepareUserFunctions([
      { expression: "1 +", name: "broken", params: [] },
      { expression: "   ", name: "empty", params: [] },
    ]);
    expect(prepared.get("broken")?.body).toBeNull();
    expect(prepared.get("broken")?.bodyError).toContain(
      "Unexpected end of expression"
    );
    expect(prepared.get("empty")?.body).toBeNull();
    expect(prepared.get("empty")?.bodyError).toContain("no expression yet");
  });

  it("keeps the first definition on case-insensitive duplicates", () => {
    const prepared = prepareUserFunctions([
      { expression: "1", name: "dup", params: [] },
      { expression: "2", name: "DUP", params: [] },
    ]);
    expect(prepared.size).toBe(1);
    expect(prepared.get("dup")?.name).toBe("dup");
  });

  it("carries the description through", () => {
    const prepared = prepareUserFunctions([
      {
        description: "Adds tax.",
        expression: "x * 1.1",
        name: "withTax",
        params: ["x"],
      },
    ]);
    expect(prepared.get("withtax")?.description).toBe("Adds tax.");
  });
});

describe("formulaUserFunctionSignature", () => {
  it("renders name(params)", () => {
    expect(
      formulaUserFunctionSignature({
        name: "weightedScore",
        params: ["points", "weight"],
      })
    ).toBe("weightedScore(points, weight)");
    expect(formulaUserFunctionSignature({ name: "tau", params: [] })).toBe(
      "tau()"
    );
  });
});
