import { describe, expect, it } from "vitest";

import { localFormulaFunctionSchema } from "@/lib/schemas/local-formula-function.ts";

const VALID = {
  createdAt: "2026-07-01T00:00:00.000Z",
  expression: "points * weight * 1.1",
  id: "fn-1",
  name: "weightedScore",
  params: ["points", "weight"],
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("localFormulaFunctionSchema", () => {
  it("parses a complete definition", () => {
    const parsed = localFormulaFunctionSchema.parse(VALID);
    expect(parsed.name).toBe("weightedScore");
    expect(parsed.params).toEqual(["points", "weight"]);
    expect(parsed.description).toBeUndefined();
  });

  it("accepts an optional description and empty params", () => {
    const parsed = localFormulaFunctionSchema.parse({
      ...VALID,
      description: "Score with a 10% bump.",
      params: [],
    });
    expect(parsed.description).toBe("Score with a 10% bump.");
    expect(parsed.params).toEqual([]);
  });

  it("rejects an empty name", () => {
    expect(
      localFormulaFunctionSchema.safeParse({ ...VALID, name: "" }).success
    ).toBe(false);
  });

  it("rejects missing fields and mistyped params", () => {
    const { id: _id, ...withoutId } = VALID;
    expect(localFormulaFunctionSchema.safeParse(withoutId).success).toBe(false);
    expect(
      localFormulaFunctionSchema.safeParse({ ...VALID, params: "points" })
        .success
    ).toBe(false);
    expect(
      localFormulaFunctionSchema.safeParse({ ...VALID, params: [1] }).success
    ).toBe(false);
  });

  it("keeps identifier rules OUT of the schema (stored rows must parse)", () => {
    // Name-rule enforcement is the ops layer's job — a legacy row whose name
    // a future rule change would reject must still round-trip from storage.
    expect(
      localFormulaFunctionSchema.safeParse({ ...VALID, name: "not" }).success
    ).toBe(true);
  });
});
