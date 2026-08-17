import { describe, expect, it } from "vitest";

import { fieldIdsAfterReorderPinningPrimary } from "@/components/database/database-properties-list.tsx";

describe("fieldIdsAfterReorderPinningPrimary", () => {
  const ids = ["title", "status", "due"] as const;

  it("returns null when the primary field would be the dragged row", () => {
    expect(fieldIdsAfterReorderPinningPrimary(ids, "title", 0, 2)).toBeNull();
  });

  it("returns null for a no-op move", () => {
    expect(fieldIdsAfterReorderPinningPrimary(ids, "title", 1, 1)).toBeNull();
  });

  it("keeps the primary field first after reordering other fields", () => {
    expect(fieldIdsAfterReorderPinningPrimary(ids, "title", 2, 1)).toEqual([
      "title",
      "due",
      "status",
    ]);
  });

  it("snaps the primary field back to first if a drop would have moved it down", () => {
    expect(fieldIdsAfterReorderPinningPrimary(ids, "title", 1, 0)).toEqual([
      "title",
      "status",
      "due",
    ]);
  });
});
