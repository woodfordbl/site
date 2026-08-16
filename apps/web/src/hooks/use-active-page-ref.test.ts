import { describe, expect, it } from "vitest";

import {
  isActiveOrDescendantSlug,
  parseActivePageRef,
} from "@/hooks/use-active-page-ref.ts";

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

describe("isActiveOrDescendantSlug", () => {
  it("matches the hub slug exactly", () => {
    expect(
      isActiveOrDescendantSlug(
        "/new-page/untitled",
        parseActivePageRef("/new-page/untitled")
      )
    ).toBe(true);
  });

  it("matches row and template paths under the hub", () => {
    const hub = "/work/projects/project-tracker";
    expect(
      isActiveOrDescendantSlug(
        hub,
        parseActivePageRef("/work/projects/project-tracker/launch-site")
      )
    ).toBe(true);
    expect(
      isActiveOrDescendantSlug(
        hub,
        parseActivePageRef("/work/projects/project-tracker/template")
      )
    ).toBe(true);
  });

  it("matches /p routes via normalized metadata slug", () => {
    expect(
      isActiveOrDescendantSlug(
        "/notes/tasks",
        parseActivePageRef("/p/notes/tasks/row-1")
      )
    ).toBe(true);
  });

  it("does not match a sibling path that shares a prefix token", () => {
    expect(
      isActiveOrDescendantSlug(
        "/notes/tasks",
        parseActivePageRef("/notes/tasks-archive")
      )
    ).toBe(false);
  });

  it("does not match the host page above the hub", () => {
    expect(
      isActiveOrDescendantSlug(
        "/new-page/untitled",
        parseActivePageRef("/new-page")
      )
    ).toBe(false);
  });
});
