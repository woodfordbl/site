import { describe, expect, it } from "vitest";

import { parseActivePageRef } from "@/hooks/use-active-page-ref.ts";

describe("parseActivePageRef", () => {
  it("reads metadata slug from /p routes", () => {
    expect(parseActivePageRef("/p/notes")).toEqual({
      pageId: null,
      slug: "/notes",
    });
  });

  it("reads nested metadata slug from /p routes", () => {
    expect(parseActivePageRef("/p/previous-work/my-notes")).toEqual({
      pageId: null,
      slug: "/previous-work/my-notes",
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
