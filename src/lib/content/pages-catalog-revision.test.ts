import { describe, expect, it } from "vitest";

import { computePagesCatalogRevision } from "@/lib/content/pages-catalog-revision.ts";
import type { Page } from "@/lib/schemas/page.ts";

describe("computePagesCatalogRevision", () => {
  it("changes when a new shipped page is added", () => {
    const before: Page[] = [
      {
        id: "home",
        slug: "/",
        title: "Home",
        parentId: null,
        blocks: [],
      },
    ];
    const after: Page[] = [
      ...before,
      {
        id: "notes",
        slug: "/notes",
        title: "Notes",
        parentId: null,
        blocks: [],
      },
    ];

    expect(computePagesCatalogRevision(before)).not.toBe(
      computePagesCatalogRevision(after)
    );
  });
});
