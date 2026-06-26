import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import { getPageMoveTargetItems } from "@/lib/pages/page-move-targets.ts";

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
    slug: "/work/notes",
    title: "Notes",
    parentId: "work",
    routeBy: "slug",
  },
];

describe("getPageMoveTargetItems", () => {
  it("excludes self and descendants", () => {
    const targets = getPageMoveTargetItems("work", pages);
    const ids = targets.map((target) => target.parentId);

    expect(ids).not.toContain("work");
    expect(ids).not.toContain("notes");
    expect(ids).toContain("home");
  });

  it("includes top level when valid", () => {
    const targets = getPageMoveTargetItems("notes", pages);
    expect(targets.some((target) => target.parentId === null)).toBe(true);
  });
});
