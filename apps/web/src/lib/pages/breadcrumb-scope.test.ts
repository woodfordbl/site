import { describe, expect, it } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  getDirectChildPages,
  getSiblingPages,
  isPageOnActiveBranch,
  pageHasDirectChildren,
} from "@/lib/pages/breadcrumb-scope.ts";

function summary(
  id: string,
  title: string,
  parentId: string | null = null
): PageSummary {
  return {
    id,
    slug: `/${id}`,
    title,
    parentId,
  };
}

const pages: PageSummary[] = [
  summary("root", "Root"),
  summary("parent", "Parent", "root"),
  summary("child-a", "Child A", "parent"),
  summary("child-b", "Child B", "parent"),
  summary("sibling", "Sibling", "root"),
];

describe("getSiblingPages", () => {
  it("returns pages sharing the same parent", () => {
    expect(getSiblingPages("child-a", pages).map((page) => page.id)).toEqual([
      "child-a",
      "child-b",
    ]);
  });
});

describe("getDirectChildPages", () => {
  it("returns sorted direct children", () => {
    expect(getDirectChildPages("parent", pages).map((page) => page.id)).toEqual(
      ["child-a", "child-b"]
    );
  });
});

describe("pageHasDirectChildren", () => {
  it("returns true when children exist", () => {
    expect(pageHasDirectChildren("parent", pages)).toBe(true);
    expect(pageHasDirectChildren("child-a", pages)).toBe(false);
  });
});

describe("isPageOnActiveBranch", () => {
  it("matches the active page", () => {
    expect(isPageOnActiveBranch("child-a", "child-a", pages)).toBe(true);
  });

  it("matches ancestors of the active page", () => {
    expect(isPageOnActiveBranch("parent", "child-a", pages)).toBe(true);
    expect(isPageOnActiveBranch("root", "child-a", pages)).toBe(true);
  });

  it("does not match unrelated pages", () => {
    expect(isPageOnActiveBranch("sibling", "child-a", pages)).toBe(false);
    expect(isPageOnActiveBranch("child-b", "child-a", pages)).toBe(false);
  });
});
