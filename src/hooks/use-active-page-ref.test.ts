import { describe, expect, it } from "vitest";

import { parseActivePageRef } from "@/hooks/use-active-page-ref.ts";

describe("parseActivePageRef", () => {
  it("reads page id from /p routes", () => {
    expect(parseActivePageRef("/p/abc-123")).toEqual({
      pageId: "abc-123",
      slug: null,
    });
  });

  it("reads slug from splat routes", () => {
    expect(parseActivePageRef("/previous-work")).toEqual({
      pageId: null,
      slug: "/previous-work",
    });
  });

  it("reads home slug", () => {
    expect(parseActivePageRef("/")).toEqual({
      pageId: null,
      slug: "/",
    });
  });
});
