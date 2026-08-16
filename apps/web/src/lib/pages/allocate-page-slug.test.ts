import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import { allocateUserPageSlug } from "@/lib/pages/allocate-page-slug.ts";

describe("allocateUserPageSlug", () => {
  it("dedupes among all siblings including shipped pages", () => {
    const pages: PageSummary[] = [
      {
        id: "server-new-page",
        slug: "/new-page",
        title: "New Page",
        parentId: null,
        routeBy: "slug",
      },
      {
        id: "user-a",
        slug: "/new-page",
        title: "New Page",
        parentId: null,
        routeBy: "id",
      },
    ];

    expect(
      allocateUserPageSlug({
        title: "New Page",
        parentId: null,
        pageId: "user-b",
        pages,
      })
    ).toBe("/new-page-2");
  });

  it("builds nested metadata slugs under a server parent", () => {
    const pages: PageSummary[] = [
      {
        id: "previous-work",
        slug: "/previous-work",
        title: "Previous Work",
        parentId: null,
        routeBy: "slug",
      },
    ];

    expect(
      allocateUserPageSlug({
        title: "Notes",
        parentId: "previous-work",
        pageId: "user-child",
        pages,
      })
    ).toBe("/previous-work/notes");
  });
});
