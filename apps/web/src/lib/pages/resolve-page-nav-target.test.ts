import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  resolveDeleteRedirectTarget,
  resolvePageNavTarget,
} from "@/lib/pages/resolve-page-nav-target.ts";

const pages: PageSummary[] = [
  { id: "home", slug: "/", title: "Home", parentId: null, routeBy: "slug" },
  {
    id: "user-notes",
    slug: "/notes",
    title: "Notes",
    parentId: null,
    routeBy: "id",
  },
  {
    id: "previous-work",
    slug: "/previous-work",
    title: "Previous Work",
    parentId: null,
    routeBy: "slug",
  },
  {
    id: "nested-user-child",
    slug: "/previous-work/my-notes",
    title: "My Notes",
    parentId: "previous-work",
    routeBy: "id",
  },
];

describe("resolvePageNavTarget", () => {
  it("routes user-created pages under /p/", () => {
    expect(resolvePageNavTarget("user-notes", pages)).toEqual({
      to: "/p/$",
      params: { _splat: "notes" },
    });
  });

  it("routes shipped pages by slug", () => {
    expect(resolvePageNavTarget("previous-work", pages)).toEqual({
      to: "/$",
      params: { _splat: "previous-work" },
    });
  });

  it("routes home by slug", () => {
    expect(resolvePageNavTarget("home", pages)).toEqual({ to: "/" });
  });

  it("routes nested user child under /p/", () => {
    expect(resolvePageNavTarget("nested-user-child", pages)).toEqual({
      to: "/p/$",
      params: { _splat: "previous-work/my-notes" },
    });
  });
});

describe("resolveDeleteRedirectTarget", () => {
  it("redirects to parent slug route when deleting nested user page", () => {
    expect(resolveDeleteRedirectTarget("nested-user-child", pages)).toEqual({
      to: "/$",
      params: { _splat: "previous-work" },
    });
  });

  it("redirects to home when deleting top-level user page", () => {
    expect(resolveDeleteRedirectTarget("user-notes", pages)).toEqual({
      to: "/",
    });
  });
});
