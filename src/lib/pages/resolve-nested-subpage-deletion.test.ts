import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { resolveNestedSubpageDeletion } from "@/lib/pages/resolve-nested-subpage-deletion.ts";
import type { Block } from "@/lib/schemas/block.ts";

const CURRENT_PAGE_ID = "host";

function pageLink(id: string, pageId: string): Block {
  return { id, type: "pageLink", props: { pageId, variant: "child" } };
}

function text(id: string): Block {
  return { id, type: "text", props: { text: id } };
}

function page(id: string, parentId: string | null): PageSummary {
  return { id, parentId, slug: `/${id}`, title: id };
}

function resolve(blocks: Block[], rowId: string, pages: PageSummary[]) {
  return resolveNestedSubpageDeletion(
    buildBlockTree(blocks),
    rowId,
    pages,
    CURRENT_PAGE_ID
  );
}

describe("resolveNestedSubpageDeletion", () => {
  it("returns the target id for a pageLink to a nested subpage", () => {
    const blocks = [pageLink("link", "child")];
    const pages = [page(CURRENT_PAGE_ID, null), page("child", CURRENT_PAGE_ID)];

    expect(resolve(blocks, "link", pages)).toBe("child");
  });

  it("returns null for a pageLink to a page nested elsewhere", () => {
    const blocks = [pageLink("link", "other")];
    const pages = [page(CURRENT_PAGE_ID, null), page("other", "somewhere")];

    expect(resolve(blocks, "link", pages)).toBeNull();
  });

  it("returns null for a pageLink to a top-level page", () => {
    const blocks = [pageLink("link", "top")];
    const pages = [page(CURRENT_PAGE_ID, null), page("top", null)];

    expect(resolve(blocks, "link", pages)).toBeNull();
  });

  it("returns null when the target page is missing", () => {
    const blocks = [pageLink("link", "ghost")];
    const pages = [page(CURRENT_PAGE_ID, null)];

    expect(resolve(blocks, "link", pages)).toBeNull();
  });

  it("returns null for a non-pageLink block", () => {
    const blocks = [text("para")];
    const pages = [page(CURRENT_PAGE_ID, null)];

    expect(resolve(blocks, "para", pages)).toBeNull();
  });

  it("returns null when the row id does not exist", () => {
    const blocks = [pageLink("link", "child")];
    const pages = [page(CURRENT_PAGE_ID, null), page("child", CURRENT_PAGE_ID)];

    expect(resolve(blocks, "missing", pages)).toBeNull();
  });
});
