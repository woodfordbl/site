import { describe, expect, it } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  resolveAdjacentSidebarPageId,
  resolveEffectiveExpandedIds,
  resolveSidebarNavPageIds,
} from "@/lib/pages/resolve-sidebar-nav-page-ids.ts";

function page(
  id: string,
  title: string,
  options: {
    parentId?: string | null;
    sidebarOrder?: number;
    databaseRowSource?: PageSummary["databaseRowSource"];
  } = {}
): PageSummary {
  return {
    id,
    slug: `/${id}`,
    title,
    parentId: options.parentId ?? null,
    sidebarOrder: options.sidebarOrder,
    databaseRowSource: options.databaseRowSource,
  };
}

describe("resolveSidebarNavPageIds", () => {
  it("orders root siblings by sidebarOrder, not title", () => {
    const pages = [
      page("beta", "Beta", { sidebarOrder: 2000 }),
      page("alpha", "Alpha", { sidebarOrder: 1000 }),
      page("gamma", "Gamma", { sidebarOrder: 3000 }),
    ];

    expect(resolveSidebarNavPageIds({ expandedIds: new Set(), pages })).toEqual(
      ["alpha", "beta", "gamma"]
    );
  });

  it("returns nested preorder when the parent is expanded", () => {
    const pages = [
      page("work", "Work", { sidebarOrder: 0 }),
      page("proj", "Projects", { parentId: "work", sidebarOrder: 0 }),
      page("about", "About", { sidebarOrder: 1000 }),
    ];

    expect(
      resolveSidebarNavPageIds({
        expandedIds: new Set(["work"]),
        pages,
      })
    ).toEqual(["work", "proj", "about"]);
  });

  it("skips collapsed children", () => {
    const pages = [
      page("work", "Work", { sidebarOrder: 0 }),
      page("proj", "Projects", { parentId: "work", sidebarOrder: 0 }),
      page("about", "About", { sidebarOrder: 1000 }),
    ];

    expect(resolveSidebarNavPageIds({ expandedIds: new Set(), pages })).toEqual(
      ["work", "about"]
    );
  });

  it("auto-expands ancestors of the active page", () => {
    const pages = [
      page("work", "Work", { sidebarOrder: 0 }),
      page("proj", "Projects", { parentId: "work", sidebarOrder: 0 }),
      page("task", "Task", { parentId: "proj", sidebarOrder: 0 }),
      page("about", "About", { sidebarOrder: 1000 }),
    ];

    expect(
      resolveSidebarNavPageIds({
        activePageId: "task",
        expandedIds: new Set(),
        pages,
      })
    ).toEqual(["work", "proj", "task", "about"]);
  });

  it("excludes database row pages from the sequence", () => {
    const pages = [
      page("db-host", "Database", { sidebarOrder: 0 }),
      page("row-page", "Row page", {
        sidebarOrder: 1000,
        databaseRowSource: { databaseId: "db-1", rowId: "row-1" },
      }),
      page("about", "About", { sidebarOrder: 2000 }),
    ];

    expect(resolveSidebarNavPageIds({ expandedIds: new Set(), pages })).toEqual(
      ["db-host", "about"]
    );
  });
});

describe("resolveEffectiveExpandedIds", () => {
  it("merges cookie ids with ancestor ids for the active page", () => {
    const pages = [
      page("work", "Work"),
      page("proj", "Projects", { parentId: "work" }),
      page("task", "Task", { parentId: "proj" }),
    ];

    expect(
      [
        ...resolveEffectiveExpandedIds({
          activePageId: "task",
          expandedIds: ["other"],
          pages,
        }),
      ].sort()
    ).toEqual(["other", "proj", "work"]);
  });
});

describe("resolveAdjacentSidebarPageId", () => {
  const pages = [
    page("work", "Work", { sidebarOrder: 0 }),
    page("proj", "Projects", { parentId: "work", sidebarOrder: 0 }),
    page("about", "About", { sidebarOrder: 1000 }),
  ];

  it("steps to the next visible page", () => {
    expect(
      resolveAdjacentSidebarPageId({
        activePageId: "work",
        delta: 1,
        expandedIds: new Set(["work"]),
        pages,
      })
    ).toBe("proj");
  });

  it("steps to the previous visible page", () => {
    expect(
      resolveAdjacentSidebarPageId({
        activePageId: "about",
        delta: -1,
        expandedIds: new Set(["work"]),
        pages,
      })
    ).toBe("proj");
  });

  it("returns null at the ends", () => {
    expect(
      resolveAdjacentSidebarPageId({
        activePageId: "about",
        delta: 1,
        expandedIds: new Set(["work"]),
        pages,
      })
    ).toBeNull();
    expect(
      resolveAdjacentSidebarPageId({
        activePageId: "work",
        delta: -1,
        expandedIds: new Set(["work"]),
        pages,
      })
    ).toBeNull();
  });

  it("returns null when the active page is not in the visible list", () => {
    expect(
      resolveAdjacentSidebarPageId({
        activePageId: "row-page",
        delta: 1,
        expandedIds: new Set(),
        pages: [
          ...pages,
          page("row-page", "Row page", {
            sidebarOrder: 500,
            databaseRowSource: { databaseId: "db-1", rowId: "row-1" },
          }),
        ],
      })
    ).toBeNull();
  });
});
