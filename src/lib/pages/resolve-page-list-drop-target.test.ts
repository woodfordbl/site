import { describe, expect, it } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { FlatVisiblePageRow } from "@/lib/pages/flatten-visible-page-rows.ts";
import {
  dropTargetToRepositionCommand,
  resolvePageListDropTargetFromPointer,
} from "@/lib/pages/resolve-page-list-drop-target.ts";

function page(
  id: string,
  slug: string,
  title: string,
  parentId: string | null = null
): PageSummary {
  return { id, slug, title, parentId };
}

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("resolvePageListDropTargetFromPointer", () => {
  const pages = [
    page("work", "/work", "Work"),
    page("notes", "/notes", "Notes"),
    page("proj", "/work/projects", "Projects", "work"),
  ];
  const visibleRows: FlatVisiblePageRow[] = [
    { pageId: "notes", depth: 0, parentId: null },
    { pageId: "work", depth: 0, parentId: null },
    { pageId: "proj", depth: 1, parentId: "work" },
  ];
  const rowRects = new Map<string, DOMRect>([
    ["notes", rect(100, 28)],
    ["work", rect(140, 28)],
    ["proj", rect(180, 28)],
  ]);

  it("returns null when not dragging", () => {
    expect(
      resolvePageListDropTargetFromPointer({
        clientY: 150,
        draggingPageId: null,
        pages,
        rowRects,
        visibleRows,
      })
    ).toBeNull();
  });

  it("nests when pointer is in the middle band", () => {
    expect(
      resolvePageListDropTargetFromPointer({
        clientY: 154,
        draggingPageId: "notes",
        pages,
        rowRects,
        visibleRows,
      })
    ).toEqual({ kind: "nest", parentPageId: "work" });
  });

  it("nests across a wide central band, not just dead-center", () => {
    // 160 sits in the lower half of the Work row (140-168) but outside the
    // narrow sibling edges/gaps, so it should nest rather than reorder.
    expect(
      resolvePageListDropTargetFromPointer({
        clientY: 160,
        draggingPageId: "notes",
        pages,
        rowRects,
        visibleRows,
      })
    ).toEqual({ kind: "nest", parentPageId: "work" });
  });

  it("inserts before when pointer is in the top band", () => {
    expect(
      resolvePageListDropTargetFromPointer({
        clientY: 142,
        draggingPageId: "notes",
        pages,
        rowRects,
        visibleRows,
      })
    ).toEqual({
      kind: "sibling",
      parentId: null,
      edge: "before",
      anchorPageId: "work",
    });
  });

  it("inserts between rows when the pointer is in the gap", () => {
    expect(
      resolvePageListDropTargetFromPointer({
        clientY: 134,
        draggingPageId: "notes",
        pages,
        rowRects,
        visibleRows,
      })
    ).toEqual({
      kind: "sibling",
      parentId: null,
      edge: "before",
      anchorPageId: "work",
    });
  });

  it("allows home to reorder among root siblings", () => {
    const homePages = [
      page("home", "/", "Home"),
      page("work", "/work", "Work"),
    ];
    const homeRows: FlatVisiblePageRow[] = [
      { pageId: "home", depth: 0, parentId: null },
      { pageId: "work", depth: 0, parentId: null },
    ];
    const homeRects = new Map<string, DOMRect>([
      ["home", rect(100, 28)],
      ["work", rect(140, 28)],
    ]);

    expect(
      resolvePageListDropTargetFromPointer({
        clientY: 165,
        draggingPageId: "home",
        pages: homePages,
        rowRects: homeRects,
        visibleRows: homeRows,
      })
    ).toEqual({
      kind: "sibling",
      parentId: null,
      edge: "after",
      anchorPageId: "work",
    });
  });

  it("does not nest home under another page", () => {
    const homePages = [
      page("home", "/", "Home"),
      page("work", "/work", "Work"),
    ];
    const homeRows: FlatVisiblePageRow[] = [
      { pageId: "home", depth: 0, parentId: null },
      { pageId: "work", depth: 0, parentId: null },
    ];
    const homeRects = new Map<string, DOMRect>([
      ["home", rect(100, 28)],
      ["work", rect(140, 28)],
    ]);

    expect(
      resolvePageListDropTargetFromPointer({
        clientY: 154,
        draggingPageId: "home",
        pages: homePages,
        rowRects: homeRects,
        visibleRows: homeRows,
      })
    ).toBeNull();
  });

  it("uses the last visible row parent when dropping below the list", () => {
    const nestedVisibleRows: FlatVisiblePageRow[] = [
      { pageId: "notes", depth: 0, parentId: null },
      { pageId: "work", depth: 0, parentId: null },
      { pageId: "proj", depth: 1, parentId: "work" },
    ];

    expect(
      resolvePageListDropTargetFromPointer({
        clientY: 220,
        draggingPageId: "notes",
        pages,
        rowRects,
        visibleRows: nestedVisibleRows,
      })
    ).toEqual({
      kind: "sibling",
      parentId: "work",
      edge: "after",
      anchorPageId: "proj",
    });
  });
});

describe("dropTargetToRepositionCommand", () => {
  const pages = [
    page("work", "/work", "Work"),
    page("notes", "/notes", "Notes"),
  ];

  it("maps nest targets to append page links", () => {
    expect(
      dropTargetToRepositionCommand(
        { kind: "nest", parentPageId: "work" },
        "notes",
        pages
      )
    ).toEqual({
      pageId: "notes",
      parentId: "work",
      insertBeforePageId: null,
      appendPageLinkOnParent: true,
    });
  });
});
