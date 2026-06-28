import { describe, expect, it } from "vitest";

import { pageReducer } from "@/hooks/use-page-dispatch.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";

const shippedPages: PageSummary[] = [
  {
    id: "home",
    slug: "/",
    title: "Home",
    parentId: null,
    routeBy: "slug",
  },
  {
    id: "server-new-page",
    slug: "/new-page",
    title: "New Page",
    parentId: null,
    routeBy: "slug",
  },
];

describe("pageReducer page.create", () => {
  it("navigates by slug and dedupes against shipped siblings", () => {
    const { effects } = pageReducer(
      { type: "page.create", title: "New Page", pageId: "user-new" },
      shippedPages
    );

    const persist = effects.find((effect) => effect.type === "page.persist");
    expect(persist?.type).toBe("page.persist");
    if (persist?.type === "page.persist") {
      expect(persist.slug).toBe("/new-page-2");
    }

    const navigate = effects.find((effect) => effect.type === "navigate");
    expect(navigate).toEqual({
      type: "navigate",
      slug: "/new-page-2",
      userPage: true,
    });
  });

  it("places a duplicate after the source page in the sidebar", () => {
    const pages: PageSummary[] = [
      {
        id: "home",
        slug: "/",
        title: "Home",
        parentId: null,
        sidebarOrder: 0,
        routeBy: "slug",
      },
      {
        id: "notes",
        slug: "/notes",
        title: "Notes",
        parentId: null,
        sidebarOrder: 1000,
        routeBy: "slug",
      },
      {
        id: "work",
        slug: "/work",
        title: "Work",
        parentId: null,
        sidebarOrder: 2000,
        routeBy: "slug",
      },
    ];

    const { effects } = pageReducer(
      {
        type: "page.create",
        title: "Copy of Notes",
        pageId: "copy-notes",
        parentId: null,
        insertAfterPageId: "notes",
      },
      pages
    );

    const persist = effects.find((effect) => effect.type === "page.persist");
    expect(persist?.type).toBe("page.persist");
    if (persist?.type === "page.persist") {
      expect(persist.sidebarOrder).toBeGreaterThan(1000);
      expect(persist.sidebarOrder).toBeLessThan(2000);
    }
  });

  it("carries the source icon and cover image onto the duplicate", () => {
    const headerImage = {
      source: "url" as const,
      src: "https://example.com/cover.jpg",
    };
    const { effects } = pageReducer(
      {
        type: "page.create",
        title: "Copy of Notes",
        pageId: "copy-notes",
        insertAfterPageId: "notes",
        icon: "tabler:notebook",
        headerImage,
      },
      shippedPages
    );

    const persist = effects.find((effect) => effect.type === "page.persist");
    expect(persist?.type).toBe("page.persist");
    if (persist?.type === "page.persist") {
      expect(persist.icon).toBe("tabler:notebook");
      expect(persist.headerImage).toEqual(headerImage);
    }
  });
});
