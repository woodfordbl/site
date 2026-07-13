import { describe, expect, it } from "vitest";

import { assertAuthorSaveAllowed } from "@/lib/content/author-save-guard.ts";

describe("assertAuthorSaveAllowed", () => {
  it("throws outside development so production builds reject author saves", () => {
    expect(() => assertAuthorSaveAllowed(false)).toThrowError(
      "Author save is only available in development"
    );
  });

  it("allows author saves in development", () => {
    expect(() => assertAuthorSaveAllowed(true)).not.toThrow();
  });
});
