import { describe, expect, it } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  isSameOriginUrl,
  resolvePageIdFromUrl,
} from "@/lib/pages/resolve-page-from-url.ts";

const pages: PageSummary[] = [
  {
    id: "home",
    slug: "/",
    title: "Home",
    parentId: null,
    routeBy: "slug",
  },
  {
    id: "work",
    slug: "/work",
    title: "Work",
    parentId: null,
    routeBy: "slug",
  },
  {
    id: "altitude",
    slug: "/previous-work/altitude",
    title: "Altitude",
    parentId: "previous-work",
    routeBy: "slug",
  },
  {
    id: "notes",
    slug: "/notes",
    title: "Notes",
    parentId: null,
    routeBy: "id",
  },
  {
    id: "nested-notes",
    slug: "/work/notes",
    title: "Notes",
    parentId: "work",
    routeBy: "id",
  },
  {
    id: "db-hub",
    slug: "/work/tasks",
    title: "Tasks",
    parentId: "work",
    routeBy: "id",
    databaseSource: { databaseId: "db-1" },
  },
];

describe("isSameOriginUrl", () => {
  it("matches the current origin including localhost ports", () => {
    expect(
      isSameOriginUrl("http://localhost:3000/work", "http://localhost:3000")
    ).toBe(true);
    expect(
      isSameOriginUrl("http://127.0.0.1:5173/p/notes", "http://127.0.0.1:5173")
    ).toBe(true);
  });

  it("rejects cross-origin URLs", () => {
    expect(
      isSameOriginUrl("https://example.com/work", "http://localhost:3000")
    ).toBe(false);
  });
});

describe("resolvePageIdFromUrl", () => {
  const origin = "https://example.com";

  it("resolves the home page", () => {
    expect(resolvePageIdFromUrl(`${origin}/`, pages, origin)).toBe("home");
  });

  it("resolves a shipped slug path", () => {
    expect(resolvePageIdFromUrl(`${origin}/work`, pages, origin)).toBe("work");
    expect(
      resolvePageIdFromUrl(`${origin}/previous-work/altitude`, pages, origin)
    ).toBe("altitude");
  });

  it("resolves a user page under /p/", () => {
    expect(resolvePageIdFromUrl(`${origin}/p/notes`, pages, origin)).toBe(
      "notes"
    );
    expect(resolvePageIdFromUrl(`${origin}/p/work/notes`, pages, origin)).toBe(
      "nested-notes"
    );
  });

  it("resolves a database hub host-relative /p/ path", () => {
    expect(resolvePageIdFromUrl(`${origin}/p/work/tasks`, pages, origin)).toBe(
      "db-hub"
    );
  });

  it("returns null for unknown same-origin paths", () => {
    expect(
      resolvePageIdFromUrl(`${origin}/does-not-exist`, pages, origin)
    ).toBeNull();
  });

  it("returns null for external URLs", () => {
    expect(
      resolvePageIdFromUrl("https://other.example/work", pages, origin)
    ).toBeNull();
  });

  it("ignores query and hash when matching", () => {
    expect(
      resolvePageIdFromUrl(`${origin}/work?x=1#section`, pages, origin)
    ).toBe("work");
  });
});
