import { describe, expect, it } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { canDropPageIntoCanvas } from "@/lib/pages/page-canvas-drop.ts";

function page(
  id: string,
  slug: string,
  parentId: string | null = null
): PageSummary {
  return { id, slug, title: id, parentId };
}

describe("canDropPageIntoCanvas", () => {
  const pages = [
    page("home", "/"),
    page("work", "/work"),
    page("notes", "/notes"),
    page("proj", "/work/projects", "work"),
  ];

  it("allows nesting an unrelated root page under the current page", () => {
    expect(
      canDropPageIntoCanvas({
        currentPageId: "work",
        droppedPageId: "notes",
        pages,
      })
    ).toBe(true);
  });

  it("rejects dropping a page into its own canvas", () => {
    expect(
      canDropPageIntoCanvas({
        currentPageId: "work",
        droppedPageId: "work",
        pages,
      })
    ).toBe(false);
  });

  it("rejects dropping an ancestor into a descendant (cycle)", () => {
    expect(
      canDropPageIntoCanvas({
        currentPageId: "proj",
        droppedPageId: "work",
        pages,
      })
    ).toBe(false);
  });

  it("rejects nesting the home page", () => {
    expect(
      canDropPageIntoCanvas({
        currentPageId: "work",
        droppedPageId: "home",
        pages,
      })
    ).toBe(false);
  });

  it("rejects drops that would exceed the max depth", () => {
    // proj sits at depth 2 (/work/projects). Dropping `alpha` — which already has
    // a one-level subtree (`beta`) — under it would reach depth 4 (> MAX 3).
    const deepPages = [
      page("work", "/work"),
      page("proj", "/work/projects", "work"),
      page("alpha", "/alpha"),
      page("beta", "/alpha/beta", "alpha"),
    ];
    expect(
      canDropPageIntoCanvas({
        currentPageId: "proj",
        droppedPageId: "alpha",
        pages: deepPages,
      })
    ).toBe(false);
  });
});
