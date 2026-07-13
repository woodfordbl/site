import { describe, expect, it } from "vitest";

import {
  databaseFieldSchema,
  databaseViewSchema,
} from "@/lib/schemas/database.ts";

describe("databaseFieldSchema", () => {
  it("parses a relation field with its target database id", () => {
    const parsed = databaseFieldSchema.parse({
      id: "f-rel",
      name: "Projects",
      type: "relation",
      targetDatabaseId: "db-target",
    });
    expect(parsed).toEqual({
      id: "f-rel",
      name: "Projects",
      type: "relation",
      targetDatabaseId: "db-target",
    });
  });

  it("rejects a relation field missing targetDatabaseId", () => {
    const result = databaseFieldSchema.safeParse({
      id: "f-rel",
      name: "Projects",
      type: "relation",
    });
    expect(result.success).toBe(false);
  });
});

describe("databaseViewSchema", () => {
  it("round-trips an advanced filter", () => {
    const view = {
      id: "v-1",
      name: "All",
      type: "table",
      advancedFilter: { expression: 'prop("f-est") > 3' },
      config: {},
    };
    const parsed = databaseViewSchema.parse(view);
    expect(parsed.advancedFilter).toEqual({
      expression: 'prop("f-est") > 3',
    });
    // Idempotent: re-parsing the parsed value changes nothing.
    expect(databaseViewSchema.parse(parsed)).toEqual(parsed);
  });

  it("keeps advancedFilter optional (existing views parse unchanged)", () => {
    const parsed = databaseViewSchema.parse({
      id: "v-1",
      name: "All",
      type: "table",
      config: {},
    });
    expect(parsed.advancedFilter).toBeUndefined();
  });
});
