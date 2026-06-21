import { describe, expect, it } from "vitest";
import type { FlatVisiblePageRow } from "@/lib/pages/flatten-visible-page-rows.ts";
import {
  applyPreviewDepthToDropTarget,
  computePageListPreviewDepthFromPointer,
  PAGE_LIST_INDENT_BASE_PX,
  PAGE_LIST_INDENT_STEP_PX,
  pageListRowPadding,
  pageListRowPaddingLeft,
} from "@/lib/pages/page-list-preview-depth.ts";

function navRect(left = 0): DOMRect {
  return {
    left,
    right: left + 200,
    top: 0,
    bottom: 400,
    width: 200,
    height: 400,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("computePageListPreviewDepthFromPointer", () => {
  it("maps horizontal position to indent depth", () => {
    const rect = navRect(100);
    expect(
      computePageListPreviewDepthFromPointer(
        rect,
        rect.left + PAGE_LIST_INDENT_BASE_PX
      )
    ).toBe(0);
    expect(
      computePageListPreviewDepthFromPointer(
        rect,
        rect.left + PAGE_LIST_INDENT_BASE_PX + PAGE_LIST_INDENT_STEP_PX
      )
    ).toBe(1);
    expect(
      computePageListPreviewDepthFromPointer(
        rect,
        rect.left + PAGE_LIST_INDENT_BASE_PX + PAGE_LIST_INDENT_STEP_PX * 2
      )
    ).toBe(2);
  });
});

describe("pageListRowPadding", () => {
  it("maps depth to sidebar row padding classes", () => {
    expect(pageListRowPadding(0)).toBe("px-2");
    expect(pageListRowPadding(1)).toBe("pr-2 pl-5");
    expect(pageListRowPadding(2)).toBe("pr-2 pl-8");
    expect(pageListRowPaddingLeft(0)).toBe("pl-2");
    expect(pageListRowPaddingLeft(1)).toBe("pl-5");
    expect(pageListRowPaddingLeft(2)).toBe("pl-8");
  });
});

describe("applyPreviewDepthToDropTarget", () => {
  const visibleRows: FlatVisiblePageRow[] = [
    { pageId: "work", depth: 0, parentId: null },
    { pageId: "proj", depth: 1, parentId: "work" },
  ];

  it("unnests sibling drops to root when preview depth is 0", () => {
    expect(
      applyPreviewDepthToDropTarget(
        {
          kind: "sibling",
          parentId: "work",
          edge: "before",
          anchorPageId: "proj",
        },
        0,
        visibleRows,
        []
      )
    ).toEqual({
      kind: "sibling",
      parentId: null,
      edge: "before",
      anchorPageId: "work",
    });
  });

  it("converts shallow nest intent to root sibling when preview depth is 0", () => {
    expect(
      applyPreviewDepthToDropTarget(
        { kind: "nest", parentPageId: "proj" },
        0,
        [...visibleRows, { pageId: "task", depth: 2, parentId: "proj" }],
        []
      )
    ).toEqual({
      kind: "sibling",
      parentId: null,
      edge: "after",
      anchorPageId: "work",
    });
  });
});
