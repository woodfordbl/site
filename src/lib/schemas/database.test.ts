import { describe, expect, it } from "vitest";

import { databaseFieldSchema } from "@/lib/schemas/database.ts";

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
