import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  SSR_TABLER_ICON_DEFAULTS,
  tablerIconNamesForSSR,
  tablerIconNamesFromPages,
} from "@/lib/pages/tabler-icon-names-from-pages.ts";

const page = (icon?: string): PageSummary => ({
  id: "page-1",
  slug: "/test",
  title: "Test",
  icon,
  parentId: null,
});

describe("tablerIconNamesForSSR", () => {
  it("always includes default passive-display icons", () => {
    expect(tablerIconNamesForSSR([])).toEqual([...SSR_TABLER_ICON_DEFAULTS]);
  });

  it("merges sidebar page icons with defaults", () => {
    const names = tablerIconNamesForSSR([
      page("tabler:IconHome"),
      page("🚀"),
      page("tabler:IconNotes"),
    ]);

    expect(names).toContain("IconFile");
    expect(names).toContain("IconInfoCircle");
    expect(names).toContain("IconHome");
    expect(names).toContain("IconNotes");
    expect(names).toHaveLength(4);
  });

  it("dedupes names shared with defaults", () => {
    expect(tablerIconNamesForSSR([page("tabler:IconFile")])).toEqual([
      "IconFile",
      "IconInfoCircle",
    ]);
  });
});

describe("tablerIconNamesFromPages", () => {
  it("collects only tabler page icons", () => {
    expect(
      tablerIconNamesFromPages([page("tabler:IconHome"), page("🚀")])
    ).toEqual(["IconHome"]);
  });
});
