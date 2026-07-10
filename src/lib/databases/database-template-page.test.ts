import { describe, expect, it } from "vitest";

import {
  databaseTemplatePageId,
  isDatabaseTemplatePageId,
} from "./database-template-page.ts";

describe("database template page ids", () => {
  it("brands ids with the reserved prefix", () => {
    expect(databaseTemplatePageId("db-1")).toBe("db-template:db-1");
  });

  it("recognizes template ids and rejects everything else", () => {
    expect(isDatabaseTemplatePageId(databaseTemplatePageId("db-1"))).toBe(true);
    expect(isDatabaseTemplatePageId("db-1")).toBe(false);
    expect(isDatabaseTemplatePageId("site-template")).toBe(false);
    expect(isDatabaseTemplatePageId(null)).toBe(false);
    expect(isDatabaseTemplatePageId(undefined)).toBe(false);
  });
});
