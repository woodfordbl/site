import { describe, expect, it } from "vitest";

import {
  resolveSlugPrefixRedirect,
  slugIsUnderPrefix,
} from "@/lib/pages/resolve-slug-prefix-redirect.ts";

describe("slugIsUnderPrefix", () => {
  it("matches the prefix exactly", () => {
    expect(slugIsUnderPrefix("/work/notes", "/work/notes")).toBe(true);
  });

  it("matches descendants under the prefix", () => {
    expect(slugIsUnderPrefix("/work/notes/todo", "/work/notes")).toBe(true);
  });

  it("does not match sibling path prefixes", () => {
    expect(slugIsUnderPrefix("/workflow", "/work")).toBe(false);
  });

  it("does not treat home as a parent of every slug", () => {
    expect(slugIsUnderPrefix("/work", "/")).toBe(false);
    expect(slugIsUnderPrefix("/", "/")).toBe(true);
  });
});

describe("resolveSlugPrefixRedirect", () => {
  it("returns null when the active route is unrelated", () => {
    expect(
      resolveSlugPrefixRedirect({
        nextPrefix: "/life/notes",
        pathname: "/about",
        previousPrefix: "/work/notes",
      })
    ).toBeNull();
  });

  it("rewrites a shipped page path when viewing the moved page", () => {
    expect(
      resolveSlugPrefixRedirect({
        nextPrefix: "/life/notes",
        pathname: "/work/notes",
        previousPrefix: "/work/notes",
      })
    ).toEqual({
      params: { _splat: "life/notes" },
      to: "/$",
    });
  });

  it("rewrites user /p paths and descendant hub/row URLs", () => {
    expect(
      resolveSlugPrefixRedirect({
        nextPrefix: "/life/notes",
        pathname: "/p/work/notes/tracker",
        previousPrefix: "/work/notes",
      })
    ).toEqual({
      params: { _splat: "life/notes/tracker" },
      to: "/p/$",
    });
  });

  it("returns null when the prefix did not change", () => {
    expect(
      resolveSlugPrefixRedirect({
        nextPrefix: "/work/notes",
        pathname: "/work/notes",
        previousPrefix: "/work/notes",
      })
    ).toBeNull();
  });

  it("ignores settings and other app routes", () => {
    expect(
      resolveSlugPrefixRedirect({
        nextPrefix: "/life/notes",
        pathname: "/settings/appearance",
        previousPrefix: "/work/notes",
      })
    ).toBeNull();
  });
});
