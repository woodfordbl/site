import { describe, expect, it } from "vitest";

import { FIELD_TYPE_DEFS } from "@/lib/databases/field-defs.ts";

describe("FIELD_TYPE_DEFS relation", () => {
  it("offers only emptiness operators (contains-row filtering is deferred)", () => {
    expect(FIELD_TYPE_DEFS.relation.operators).toEqual([
      "isEmpty",
      "isNotEmpty",
    ]);
    expect(FIELD_TYPE_DEFS.relation.defaultOperator).toBe("isNotEmpty");
  });

  it("stores id arrays — the multi-select value shape", () => {
    expect(FIELD_TYPE_DEFS.relation.valueKind).toBe("optionIds");
    expect(FIELD_TYPE_DEFS.relation.label).toBe("Relation");
  });
});
