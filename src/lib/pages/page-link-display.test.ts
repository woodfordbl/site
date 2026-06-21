import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import { pageLinkShowsExternalIcon } from "@/lib/pages/page-link-display.ts";

const childPage: PageSummary = {
  id: "child",
  title: "New Page",
  slug: "/parent/new-page",
  parentId: "parent",
  routeBy: "id",
};

describe("pageLinkShowsExternalIcon", () => {
  it("hides the icon for slash New Page child links", () => {
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "child", variant: "child" },
        childPage,
        "parent"
      )
    ).toBe(false);
  });

  it("shows the icon for Link To Page references", () => {
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "child", variant: "linked" },
        childPage,
        "parent"
      )
    ).toBe(true);
  });

  it("infers child links without variant when the target is a direct child", () => {
    expect(
      pageLinkShowsExternalIcon({ pageId: "child" }, childPage, "parent")
    ).toBe(false);
  });

  it("infers linked pages without variant when the target is not a direct child", () => {
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "other" },
        { ...childPage, id: "other", parentId: null },
        "parent"
      )
    ).toBe(true);
  });
});
