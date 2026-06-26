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
    id: "notes",
    slug: "/notes",
    title: "Notes",
    parentId: null,
    routeBy: "id",
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

  it("builds /p route for user pages", () => {
    expect(buildPageLinkUrl("notes", pages, "https://example.com")).toBe(
      "https://example.com/p/notes"
    );
  });
});
