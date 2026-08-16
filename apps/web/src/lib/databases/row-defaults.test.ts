import { describe, expect, it } from "vitest";

import {
  isCreatedTodayDefault,
  ROW_DEFAULT_CREATED_TODAY,
  resolveRowDefaultValues,
} from "@/lib/databases/row-defaults.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

const fields: DatabaseField[] = [
  { id: "f-name", name: "Name", type: "text" },
  { id: "f-due", name: "Due", type: "date" },
];

describe("resolveRowDefaultValues", () => {
  it("returns an empty map when the database has no defaults", () => {
    expect(resolveRowDefaultValues({ fields, rowDefaults: undefined })).toEqual(
      {}
    );
  });

  it("passes literal defaults through unchanged", () => {
    expect(
      resolveRowDefaultValues({
        fields,
        rowDefaults: { "f-name": "New task", "f-due": "2026-08-01" },
      })
    ).toEqual({ "f-name": "New task", "f-due": "2026-08-01" });
  });

  it("resolves the created-today sentinel on date fields to now's local date", () => {
    const resolved = resolveRowDefaultValues(
      { fields, rowDefaults: { "f-due": ROW_DEFAULT_CREATED_TODAY } },
      new Date(2026, 6, 10)
    );
    expect(resolved).toEqual({ "f-due": "2026-07-10" });
  });

  it("leaves the sentinel literal on non-date fields", () => {
    const resolved = resolveRowDefaultValues(
      { fields, rowDefaults: { "f-name": ROW_DEFAULT_CREATED_TODAY } },
      new Date(2026, 6, 10)
    );
    expect(resolved).toEqual({ "f-name": ROW_DEFAULT_CREATED_TODAY });
  });
});

describe("isCreatedTodayDefault", () => {
  it("matches only the sentinel", () => {
    expect(isCreatedTodayDefault(ROW_DEFAULT_CREATED_TODAY)).toBe(true);
    expect(isCreatedTodayDefault("2026-07-10")).toBe(false);
    expect(isCreatedTodayDefault(undefined)).toBe(false);
  });
});
