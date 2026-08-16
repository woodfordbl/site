import { describe, expect, it } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  assertPageCanHaveChild,
  buildPageTree,
  buildSlugFromTitle,
  collectDescendantPageIds,
  dedupePageSegment,
  getAncestorPageIds,
  replacePageSlugPrefix,
} from "@/lib/pages/build-page-tree.ts";
import { MAX_PAGE_DEPTH } from "@/lib/pages/page-depth.ts";
import {
  buildChildSlug,
  getPageSegment,
  parsePagePath,
} from "@/lib/pages/slugify.ts";

function page(
  id: string,
  slug: string,
  title: string,
  parentId: string | null = null
): PageSummary {
  return { id, slug, title, parentId };
}

describe("parsePagePath", () => {
  it("parses nested paths", () => {
    expect(parsePagePath("/work/projects")).toEqual(["work", "projects"]);
  });

  it("returns empty segments for home", () => {
    expect(parsePagePath("/")).toEqual([]);
  });
});

describe("buildChildSlug", () => {
  it("builds nested child paths", () => {
    expect(buildChildSlug("/work", "projects")).toBe("/work/projects");
  });

  it("keeps home children at top-level paths", () => {
    expect(buildChildSlug("/", "notes")).toBe("/notes");
  });
});

describe("buildPageTree", () => {
  it("sorts siblings by sidebarOrder before title", () => {
    const pages = [
      page("b", "/b", "Beta", null),
      page("a", "/a", "Alpha", null),
    ];
    pages[0].sidebarOrder = 2000;
    pages[1].sidebarOrder = 1000;

    const tree = buildPageTree(pages);
    expect(tree.map((row) => row.page.id)).toEqual(["a", "b"]);
  });

  it("builds nested rows by parentId", () => {
    const pages = [
      page("work", "/work", "Work"),
      page("proj", "/work/projects", "Projects", "work"),
      page("about", "/about", "About"),
    ];

    const tree = buildPageTree(pages);

    expect(tree.map((row) => row.page.id)).toEqual(["about", "work"]);
    expect(tree[1]?.children.map((row) => row.page.id)).toEqual(["proj"]);
  });
});

describe("assertPageCanHaveChild", () => {
  it("allows children under shallow pages", () => {
    const pages = [page("work", "/work", "Work")];
    expect(() => assertPageCanHaveChild(pages[0], pages)).not.toThrow();
  });

  it("blocks children beyond max depth", () => {
    const pages = [
      page("a", "/a", "A"),
      page("b", "/a/b", "B", "a"),
      page("c", "/a/b/c", "C", "b"),
      page("d", "/a/b/c/d", "D", "c"),
      page("e", "/a/b/c/d/e", "E", "d"),
    ];

    expect(() => assertPageCanHaveChild(pages[2], pages)).not.toThrow();
    expect(() => assertPageCanHaveChild(pages[4], pages)).toThrow(
      `Pages cannot be nested deeper than ${MAX_PAGE_DEPTH} segments`
    );
  });
});

describe("replacePageSlugPrefix", () => {
  it("updates descendant slugs when a parent path changes", () => {
    expect(replacePageSlugPrefix("/work", "/lab", "/work/projects")).toBe(
      "/lab/projects"
    );
  });
});

describe("getAncestorPageIds", () => {
  it("returns parent chain from child to root", () => {
    const pages = [
      page("work", "/work", "Work"),
      page("proj", "/work/projects", "Projects", "work"),
      page("alpha", "/work/projects/alpha", "Alpha", "proj"),
    ];

    expect(getAncestorPageIds("alpha", pages)).toEqual(["proj", "work"]);
  });
});

describe("collectDescendantPageIds", () => {
  it("returns nested descendants", () => {
    const pages = [
      page("work", "/work", "Work"),
      page("proj", "/work/projects", "Projects", "work"),
      page("alpha", "/work/projects/alpha", "Alpha", "proj"),
    ];

    expect(collectDescendantPageIds("work", pages)).toEqual(["proj", "alpha"]);
  });
});

describe("dedupePageSegment", () => {
  it("suffixes duplicate sibling segments", () => {
    const siblings = [page("one", "/work/untitled", "One", "work")];
    expect(dedupePageSegment("untitled", siblings)).toBe("untitled-2");
  });
});

describe("buildSlugFromTitle", () => {
  it("keeps home at / when the title changes", () => {
    const pages = [page("home", "/", "Blake Woodford")];

    expect(
      buildSlugFromTitle(pages[0], pages, "New Home Title", (value) =>
        value.toLowerCase().replace(/\s+/g, "-")
      )
    ).toBe("/");
  });

  it("replaces the last segment for other top-level pages", () => {
    const pages = [page("about", "/about", "About")];

    expect(
      buildSlugFromTitle(pages[0], pages, "About Me", (value) =>
        value.toLowerCase().replace(/\s+/g, "-")
      )
    ).toBe("/about-me");
  });

  it("suffixes duplicate segments when a shipped sibling exists", () => {
    const pages = [
      page("server-new-page", "/new-page", "New Page"),
      page("user-a", "/draft", "Draft"),
    ];

    expect(
      buildSlugFromTitle(pages[1], pages, "New Page", (value) =>
        value.toLowerCase().replace(/\s+/g, "-")
      )
    ).toBe("/new-page-2");
  });

  it("suffixes when multiple siblings already use the base segment", () => {
    const pages = [
      page("server-new-page", "/new-page", "New Page"),
      page("user-b", "/new-page-2", "New Page"),
      page("user-a", "/draft", "Draft"),
    ];

    expect(
      buildSlugFromTitle(pages[2], pages, "New Page", (value) =>
        value.toLowerCase().replace(/\s+/g, "-")
      )
    ).toBe("/new-page-3");
  });
});

describe("getPageSegment", () => {
  it("returns the last path segment", () => {
    expect(getPageSegment("/work/projects")).toBe("projects");
  });
});
