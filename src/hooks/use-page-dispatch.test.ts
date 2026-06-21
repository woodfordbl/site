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
});
