import { describe, expect, it } from "vitest";

import {
  filterActionMenuItems,
  matchesActionMenuQuery,
} from "@/lib/canvas/filter-action-menu-items.ts";

describe("filterActionMenuItems", () => {
  const items = [
    {
      id: "duplicate",
      label: "Duplicate",
      keywords: ["copy"],
      onSelect: () => {},
    },
    { id: "delete", label: "Delete", keywords: ["remove"], onSelect: () => {} },
  ];

  it("returns all items for an empty query", () => {
    expect(filterActionMenuItems(items, "")).toEqual(items);
  });

  it("matches labels and keywords", () => {
    expect(filterActionMenuItems(items, "copy")).toEqual([items[0]]);
    expect(filterActionMenuItems(items, "remove")).toEqual([items[1]]);
  });

  it("returns no matches when nothing fits", () => {
    expect(filterActionMenuItems(items, "fit to width")).toEqual([]);
  });
});

describe("matchesActionMenuQuery", () => {
  it("is case-insensitive", () => {
    expect(matchesActionMenuQuery("Header row", "HEADER", ["table"])).toBe(
      true
    );
  });
});
