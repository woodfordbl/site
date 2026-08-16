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
  it("hides the icon when the canvas is the target's current parent (subpage)", () => {
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "child", variant: "child" },
        childPage,
        "parent"
      )
    ).toBe(false);
  });

  it("shows the icon when the canvas is not the target's parent (link)", () => {
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "child", variant: "child" },
        childPage,
        "elsewhere"
      )
    ).toBe(true);
  });

  it("relational rule overrides authoring variant", () => {
    // A `linked` block whose target is in fact a child of the current canvas
    // renders as a subpage (no arrow) — the live parent relationship wins.
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "child", variant: "linked" },
        childPage,
        "parent"
      )
    ).toBe(false);
    // A `linked` block on a canvas that is not the target's parent shows the arrow.
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "child", variant: "linked" },
        childPage,
        "elsewhere"
      )
    ).toBe(true);
  });

  it("auto-corrects across a move: same block flips by which parent renders it", () => {
    const block = { pageId: "child", variant: "child" as const };
    // Lives in the old parent's canvas after the page moved away → now a link.
    expect(
      pageLinkShowsExternalIcon(
        block,
        { ...childPage, parentId: "newParent" },
        "parent"
      )
    ).toBe(true);
    // Lives in the new parent's canvas → subpage.
    expect(
      pageLinkShowsExternalIcon(
        block,
        { ...childPage, parentId: "newParent" },
        "newParent"
      )
    ).toBe(false);
  });

  it("falls back to the stored variant when the target is unknown", () => {
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "child", variant: "child" },
        null,
        "parent"
      )
    ).toBe(false);
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "child", variant: "linked" },
        null,
        "parent"
      )
    ).toBe(true);
    expect(pageLinkShowsExternalIcon({ pageId: "child" }, null, "parent")).toBe(
      false
    );
  });

  it("falls back to the stored variant when the canvas id is unknown", () => {
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "child", variant: "linked" },
        childPage,
        null
      )
    ).toBe(true);
    expect(
      pageLinkShowsExternalIcon(
        { pageId: "child", variant: "child" },
        childPage,
        null
      )
    ).toBe(false);
  });
});
