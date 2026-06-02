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
    ];

    expect(() => assertPageCanHaveChild(pages[2], pages)).toThrow(
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
});

describe("getPageSegment", () => {
  it("returns the last path segment", () => {
    expect(getPageSegment("/work/projects")).toBe("projects");
  });
});
