import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import { mergePageList } from "@/lib/pages/merge-page-list.ts";
import { TEMPLATE_PAGE_ID } from "@/lib/pages/template-page.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

const serverPages: PageSummary[] = [
  { id: "home", slug: "/", title: "Home", parentId: null },
  {
    id: "about",
    slug: "/about",
    title: "About",
    parentId: null,
    icon: "tabler:IconBook",
  },
];

function localPage(
  overrides: Partial<LocalPage> & Pick<LocalPage, "id">
): LocalPage {
  return {
    id: overrides.id,
    slug: overrides.slug ?? "/about",
    title: overrides.title ?? "About",
    icon: overrides.icon,
    parentId: overrides.parentId ?? null,
    serverBaselineHash: overrides.serverBaselineHash ?? "hash",
    deletedAt: overrides.deletedAt,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("mergePageList", () => {
  it("hides server pages with a local delete tombstone", () => {
    const merged = mergePageList(serverPages, [
      localPage({ id: "about", deletedAt: "2026-01-02T00:00:00.000Z" }),
    ]);

    expect(merged.map((page) => page.id)).toEqual(["home"]);
  });

  it("keeps user-created pages and applies local metadata overrides", () => {
    const merged = mergePageList(serverPages, [
      {
        id: "notes",
        slug: "/notes",
        title: "Notes",
        parentId: null,
        serverBaselineHash: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      localPage({
        id: "about",
        title: "About (edited)",
        slug: "/about-edited",
      }),
    ]);

    expect(merged.map((page) => page.id).sort()).toEqual([
      "about",
      "home",
      "notes",
    ]);
    expect(merged.find((page) => page.id === "notes")?.routeBy).toBe("id");
    expect(merged.find((page) => page.id === "about")?.routeBy).toBe("slug");
  });

  it("keeps server icon when local doc has no icon override", () => {
    const merged = mergePageList(serverPages, [
      localPage({
        id: "about",
        title: "About (edited)",
        slug: "/about-edited",
      }),
    ]);

    expect(merged.find((page) => page.id === "about")?.icon).toBe(
      "tabler:IconBook"
    );
  });

  it("excludes the template snapshot from the navigable list", () => {
    const merged = mergePageList(serverPages, [
      {
        id: TEMPLATE_PAGE_ID,
        slug: "/__template__",
        title: "Page template",
        parentId: null,
        serverBaselineHash: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(merged.some((page) => page.id === TEMPLATE_PAGE_ID)).toBe(false);
    expect(merged.map((page) => page.id).sort()).toEqual(["about", "home"]);
  });

  it("prefers local icon over server icon", () => {
    const merged = mergePageList(serverPages, [
      localPage({
        id: "about",
        icon: "🚀",
        title: "About",
        slug: "/about",
      }),
    ]);

    expect(merged.find((page) => page.id === "about")?.icon).toBe("🚀");
  });
});
