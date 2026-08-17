import { describe, expect, it } from "vitest";

import { resolveShippedDatabaseAction } from "@/lib/databases/resolve-shipped-database-action.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

function localDatabase(serverBaselineHash?: string): LocalDatabase {
  return {
    id: "db-1",
    name: "Reading list",
    primaryFieldId: "f-1",
    fields: [],
    views: [],
    serverBaselineHash,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

describe("resolveShippedDatabaseAction", () => {
  it("inserts when no local copy exists", () => {
    expect(
      resolveShippedDatabaseAction({
        local: null,
        localCurrentHash: null,
        shippedHash: "new",
        tombstoned: false,
      })
    ).toBe("insert");
  });

  it("never resurrects a tombstoned shipped database", () => {
    expect(
      resolveShippedDatabaseAction({
        local: null,
        localCurrentHash: null,
        shippedHash: "new",
        tombstoned: true,
      })
    ).toBe("skip-tombstoned");
  });

  it("never clobbers a user-owned database with the same id", () => {
    expect(
      resolveShippedDatabaseAction({
        local: localDatabase(undefined),
        localCurrentHash: "whatever",
        shippedHash: "new",
        tombstoned: false,
      })
    ).toBe("skip-user-owned");
  });

  it("skips when the local copy already matches the shipped baseline", () => {
    expect(
      resolveShippedDatabaseAction({
        local: localDatabase("same"),
        localCurrentHash: "same",
        shippedHash: "same",
        tombstoned: false,
      })
    ).toBe("skip-up-to-date");
  });

  it("replaces an unedited copy when the shipped content changed", () => {
    expect(
      resolveShippedDatabaseAction({
        local: localDatabase("old"),
        localCurrentHash: "old", // still matches its baseline → unedited
        shippedHash: "new",
        tombstoned: false,
      })
    ).toBe("replace");
  });

  it("keeps an edited copy when the shipped content changed", () => {
    expect(
      resolveShippedDatabaseAction({
        local: localDatabase("old"),
        localCurrentHash: "diverged",
        shippedHash: "new",
        tombstoned: false,
      })
    ).toBe("skip-edited");
  });
});
