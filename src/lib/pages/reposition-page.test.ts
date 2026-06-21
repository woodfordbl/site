import { describe, expect, it } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { MAX_PAGE_DEPTH } from "@/lib/pages/page-depth.ts";
import {
  assertCanReposition,
  planPageReposition,
} from "@/lib/pages/reposition-page.ts";

function page(
  id: string,
  slug: string,
  title: string,
  parentId: string | null = null,
  routeBy: "id" | "slug" = "slug"
): PageSummary {
  return { id, slug, title, parentId, routeBy };
}

describe("assertCanReposition", () => {
  it("allows reordering home among root siblings", () => {
    const pages = [page("home", "/", "Home"), page("work", "/work", "Work")];
    expect(() =>
      assertCanReposition({ pageId: "home", parentId: null, pages })
    ).not.toThrow();
  });

  it("rejects nesting home under another page", () => {
    const pages = [page("home", "/", "Home"), page("work", "/work", "Work")];
    expect(() =>
      assertCanReposition({ pageId: "home", parentId: "work", pages })
    ).toThrow("Home cannot be nested");
  });

  it("rejects nesting under a descendant", () => {
    const pages = [page("a", "/a", "A"), page("b", "/a/b", "B", "a")];
    expect(() =>
      assertCanReposition({ pageId: "a", parentId: "b", pages })
    ).toThrow("descendant");
  });
});

describe("planPageReposition", () => {
  it("plans slug and sidebar order for a root move", () => {
    const pages = [
      page("work", "/work", "Work"),
      page("notes", "/notes", "Notes"),
    ];

    const plan = planPageReposition({
      pageId: "notes",
      parentId: null,
      insertBeforePageId: "work",
      pages,
    });

    expect(plan.parentId).toBeNull();
    expect(plan.slug).toBe("/notes");
    expect(plan.scopeSidebarOrderUpdates).toEqual([
      { pageId: "notes", sidebarOrder: 0 },
      { pageId: "work", sidebarOrder: 1000 },
    ]);
    expect(plan.sidebarOrder).toBe(0);
  });

  it("rebalances every sibling when appending to the bottom", () => {
    const pages = [
      page("about", "/about", "About"),
      page("work", "/work", "Work"),
      page("notes", "/notes", "Notes"),
    ];

    const plan = planPageReposition({
      pageId: "notes",
      parentId: null,
      insertBeforePageId: null,
      pages,
    });

    expect(plan.scopeSidebarOrderUpdates).toEqual([
      { pageId: "about", sidebarOrder: 0 },
      { pageId: "work", sidebarOrder: 1000 },
      { pageId: "notes", sidebarOrder: 2000 },
    ]);
  });

  it("rebalances home when appending at the root", () => {
    const pages = [page("home", "/", "Home"), page("work", "/work", "Work")];

    const plan = planPageReposition({
      pageId: "home",
      parentId: null,
      insertBeforePageId: null,
      pages,
    });

    expect(plan.slug).toBe("/");
    expect(plan.scopeSidebarOrderUpdates).toEqual([
      { pageId: "work", sidebarOrder: 0 },
      { pageId: "home", sidebarOrder: 1000 },
    ]);
  });

  it("blocks moves that exceed max depth", () => {
    const pages = [
      page("a", "/a", "A"),
      page("b", "/a/b", "B", "a"),
      page("c", "/a/b/c", "C", "b"),
      page("d", "/d", "D"),
    ];

    expect(() =>
      planPageReposition({
        pageId: "d",
        parentId: "c",
        pages,
      })
    ).toThrow(`${MAX_PAGE_DEPTH}`);
  });
});
