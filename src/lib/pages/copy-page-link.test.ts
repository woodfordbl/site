import { describe, expect, it } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { buildPageLinkUrl } from "@/lib/pages/copy-page-link.ts";

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
  {
    id: "db-row",
    slug: "/work/tasks/ship-it",
    title: "Ship it",
    parentId: "db-hub",
    routeBy: "id",
    databaseRowSource: { databaseId: "db-1", rowId: "row-1" },
  },
];

describe("buildPageLinkUrl", () => {
  it("builds root URL for home", () => {
    expect(buildPageLinkUrl("home", pages, "https://example.com")).toBe(
      "https://example.com/"
    );
  });

  it("builds slug route for shipped pages", () => {
    expect(buildPageLinkUrl("work", pages, "https://example.com")).toBe(
      "https://example.com/work"
    );
  });

  it("builds nested slug route for shipped child pages", () => {
    expect(buildPageLinkUrl("altitude", pages, "https://example.com")).toBe(
      "https://example.com/previous-work/altitude"
    );
  });

  it("builds /p route for user pages", () => {
    expect(buildPageLinkUrl("notes", pages, "https://example.com")).toBe(
      "https://example.com/p/notes"
    );
  });

  it("keeps every segment for nested user pages", () => {
    expect(buildPageLinkUrl("nested-notes", pages, "https://example.com")).toBe(
      "https://example.com/p/work/notes"
    );
  });

  it("builds the host-relative route for a database hub page", () => {
    expect(buildPageLinkUrl("db-hub", pages, "https://example.com")).toBe(
      "https://example.com/p/work/tasks"
    );
  });

  it("builds the host-relative route for a database row page", () => {
    expect(buildPageLinkUrl("db-row", pages, "https://example.com")).toBe(
      "https://example.com/p/work/tasks/ship-it"
    );
  });

  it("does not double the slash when origin has a trailing slash", () => {
    expect(buildPageLinkUrl("work", pages, "https://example.com/")).toBe(
      "https://example.com/work"
    );
  });

  it("returns null for pages outside the navigable list", () => {
    // The template snapshot and dev fixture never reach `pages`; copying the
    // bare origin there would silently hand out a link to the home page.
    expect(
      buildPageLinkUrl("site-template", pages, "https://example.com")
    ).toBe(null);
  });
});
