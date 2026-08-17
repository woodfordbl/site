// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  getRememberedSlugPageId,
  rememberSlugPageResolution,
} from "@/lib/pages/remember-slug-page-resolution.ts";

describe("rememberSlugPageResolution", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("remembers and reads a page id for a normalized slug", () => {
    rememberSlugPageResolution("/work/notes", "page-1");

    expect(getRememberedSlugPageId("/work/notes")).toBe("page-1");
    expect(getRememberedSlugPageId("work/notes")).toBe("page-1");
  });
});
