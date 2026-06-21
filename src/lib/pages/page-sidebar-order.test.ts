import { describe, expect, it } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  comparePageSiblings,
  computeSidebarOrderForInsert,
  sortPagesInScope,
} from "@/lib/pages/page-sidebar-order.ts";

function page(id: string, title: string, sidebarOrder?: number): PageSummary {
  return {
    id,
    slug: `/${id}`,
    title,
    parentId: null,
    sidebarOrder,
  };
}

describe("comparePageSiblings", () => {
  it("orders by sidebarOrder before title", () => {
    expect(
      comparePageSiblings(page("b", "B", 2000), page("a", "A", 1000))
    ).toBe(1000);
  });

  it("falls back to title when orders tie or are missing", () => {
    expect(
      comparePageSiblings(page("b", "Beta"), page("a", "Alpha"))
    ).toBeGreaterThan(0);
    expect(comparePageSiblings(page("a", "A", 0), page("b", "B"))).toBeLessThan(
      0
    );
  });
});

describe("computeSidebarOrderForInsert", () => {
  it("appends after the last sibling", () => {
    const order = computeSidebarOrderForInsert({
      siblings: [page("a", "A", 0), page("b", "B", 1000)],
      insertBeforePageId: null,
    });
    expect(order).toBe(2000);
  });

  it("inserts before a target sibling", () => {
    const order = computeSidebarOrderForInsert({
      siblings: [page("a", "A", 0), page("b", "B", 1000)],
      insertBeforePageId: "b",
    });
    expect(order).toBeGreaterThan(0);
    expect(order).toBeLessThan(1000);
  });
});

describe("sortPagesInScope", () => {
  it("returns siblings sorted by sidebar order", () => {
    const sorted = sortPagesInScope(
      [page("b", "B", 2000), page("a", "A", 1000)],
      null
    );
    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});
