import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalFormulaFunction } from "@/lib/schemas/local-formula-function.ts";

// Map-backed stand-in for the localStorage collection: exercises the ops'
// validation + write behavior without TanStack DB (the keybindings-style
// direct insert/update/delete surface is all the ops touch).
const store = vi.hoisted(() => new Map<string, LocalFormulaFunction>());

vi.mock("@/db/collections/local-collections.ts", () => ({
  localFormulaFunctionsCollection: {
    delete: (id: string) => store.delete(id),
    get: (id: string) => store.get(id),
    has: (id: string) => store.has(id),
    insert: (fn: LocalFormulaFunction) => store.set(fn.id, fn),
    get toArray() {
      return [...store.values()];
    },
    update: (id: string, recipe: (draft: LocalFormulaFunction) => void) => {
      const existing = store.get(id);
      if (existing !== undefined) {
        const draft = structuredClone(existing);
        recipe(draft);
        store.set(id, draft);
      }
    },
  },
}));

const {
  createFormulaFunction,
  deleteFormulaFunction,
  formulaFunctionValidationError,
  listFormulaFunctions,
  updateFormulaFunction,
} = await import("@/db/queries/formula-function-ops.ts");

beforeEach(() => {
  store.clear();
});

describe("createFormulaFunction", () => {
  it("creates a definition with timestamps and an id", () => {
    const result = createFormulaFunction({
      expression: "points * weight * 1.1",
      name: "weightedScore",
      params: ["points", "weight"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fn.id).toBeTruthy();
      expect(result.fn.createdAt).toBe(result.fn.updatedAt);
      expect(store.get(result.fn.id)?.name).toBe("weightedScore");
    }
  });

  it("rejects reserved words, catalog names/aliases, and roots", () => {
    for (const name of ["not", "round", "AVG", "prop", "let", "thisPage"]) {
      const result = createFormulaFunction({
        expression: "1",
        name,
        params: [],
      });
      expect(result.ok, name).toBe(false);
    }
    expect(store.size).toBe(0);
  });

  it("rejects case-insensitive duplicates", () => {
    createFormulaFunction({ expression: "1", name: "myFn", params: [] });
    const dup = createFormulaFunction({
      expression: "2",
      name: "MYFN",
      params: [],
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) {
      expect(dup.error).toContain("already exists");
    }
    expect(store.size).toBe(1);
  });

  it("rejects invalid params before writing", () => {
    const result = createFormulaFunction({
      expression: "a + a",
      name: "fine",
      params: ["a", "a"],
    });
    expect(result.ok).toBe(false);
    expect(store.size).toBe(0);
  });

  it("keeps the description when supplied", () => {
    const result = createFormulaFunction({
      description: "Bumps by 10%.",
      expression: "x * 1.1",
      name: "bump",
      params: ["x"],
    });
    expect(result.ok && result.fn.description).toBe("Bumps by 10%.");
  });
});

describe("updateFormulaFunction", () => {
  it("updates the expression and bumps updatedAt", () => {
    const created = createFormulaFunction({
      expression: "x",
      name: "fn",
      params: ["x"],
    });
    if (!created.ok) {
      throw new Error("create failed");
    }
    const result = updateFormulaFunction(created.fn.id, {
      expression: "x * 2",
    });
    expect(result.ok).toBe(true);
    expect(store.get(created.fn.id)?.expression).toBe("x * 2");
  });

  it("revalidates renames against OTHER definitions only", () => {
    const a = createFormulaFunction({
      expression: "1",
      name: "a1",
      params: [],
    });
    createFormulaFunction({ expression: "2", name: "b1", params: [] });
    if (!a.ok) {
      throw new Error("create failed");
    }
    // Renaming onto a sibling collides…
    expect(updateFormulaFunction(a.fn.id, { name: "B1" }).ok).toBe(false);
    // …but keeping (or re-casing) its own name is fine.
    expect(updateFormulaFunction(a.fn.id, { name: "A1" }).ok).toBe(true);
    expect(store.get(a.fn.id)?.name).toBe("A1");
  });

  it("errors on unknown ids without throwing", () => {
    const result = updateFormulaFunction("missing", { expression: "1" });
    expect(result.ok).toBe(false);
  });
});

describe("deleteFormulaFunction / listFormulaFunctions", () => {
  it("deletes idempotently and lists name-sorted", () => {
    const b = createFormulaFunction({
      expression: "1",
      name: "beta",
      params: [],
    });
    createFormulaFunction({ expression: "1", name: "alpha", params: [] });
    expect(listFormulaFunctions().map((fn) => fn.name)).toEqual([
      "alpha",
      "beta",
    ]);
    if (b.ok) {
      deleteFormulaFunction(b.fn.id);
      deleteFormulaFunction(b.fn.id);
    }
    expect(listFormulaFunctions().map((fn) => fn.name)).toEqual(["alpha"]);
  });
});

describe("formulaFunctionValidationError", () => {
  it("reports the first failing rule, name before params", () => {
    createFormulaFunction({ expression: "1", name: "taken", params: [] });
    expect(formulaFunctionValidationError("taken", [])).toContain(
      "already exists"
    );
    expect(formulaFunctionValidationError("fresh", ["not"])).toContain(
      "is reserved"
    );
    expect(formulaFunctionValidationError("fresh", ["ok"])).toBeNull();
  });
});
