import { describe, expect, it } from "vitest";

import {
  buildPageLinkPreviewBody,
  pageLinkPreviewLines,
} from "@/lib/pages/page-link-preview-model.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("pageLinkPreviewLines", () => {
  it("keeps prose in document order and drops blank rows", () => {
    const blocks: Block[] = [
      { id: "h", type: "heading", props: { level: 2, text: "Notes" } },
      { id: "a", type: "text", props: { text: "First" } },
      // Pages keep trailing empty rows; a preview of whitespace helps nobody.
      { id: "blank", type: "text", props: { text: "   " } },
      { id: "b", type: "text", props: { text: "Second" } },
    ];

    expect(pageLinkPreviewLines(blocks)).toEqual([
      { id: "h", kind: "heading", level: 2, text: "Notes" },
      { id: "a", kind: "text", text: "First" },
      { id: "b", kind: "text", text: "Second" },
    ]);
  });

  it("flattens list children into bullets and numbers ordered lists", () => {
    const blocks: Block[] = [
      { id: "list", type: "list", props: { variant: "ordered" } },
      { id: "one", type: "text", parentId: "list", props: { text: "One" } },
      {
        id: "two",
        type: "text",
        parentId: "list",
        indent: 1,
        props: { text: "Two" },
      },
    ];

    expect(pageLinkPreviewLines(blocks)).toEqual([
      {
        depth: 0,
        id: "one",
        index: 1,
        kind: "bullet",
        ordered: true,
        text: "One",
      },
      {
        depth: 1,
        id: "two",
        index: 2,
        kind: "bullet",
        ordered: true,
        text: "Two",
      },
    ]);
  });

  it("reduces a table to its header labels and a database to its id", () => {
    const blocks: Block[] = [
      {
        id: "table",
        type: "table",
        props: { hasHeaderRow: true, hasHeaderColumn: false, columnWidths: [] },
      },
      { id: "row", type: "tableRow", parentId: "table", props: {} },
      {
        id: "c1",
        type: "tableCell",
        parentId: "row",
        props: { text: "Name" },
      },
      {
        id: "c2",
        type: "tableCell",
        parentId: "row",
        props: { text: "Tags" },
      },
      { id: "db", type: "database", props: { databaseId: "db-1" } },
    ];

    expect(pageLinkPreviewLines(blocks)).toEqual([
      { columns: ["Name", "Tags"], id: "table", kind: "table" },
      { databaseId: "db-1", id: "db", kind: "database" },
    ]);
  });

  it("shows only the open tab, the way a reader sees it", () => {
    const blocks: Block[] = [
      { id: "tabs", type: "tabs", props: { defaultTabId: "tab-b" } },
      { id: "tab-a", type: "tab", parentId: "tabs", props: { label: "A" } },
      { id: "hidden", type: "text", parentId: "tab-a", props: { text: "A" } },
      { id: "tab-b", type: "tab", parentId: "tabs", props: { label: "B" } },
      { id: "shown", type: "text", parentId: "tab-b", props: { text: "B" } },
    ];

    expect(pageLinkPreviewLines(blocks)).toEqual([
      { id: "shown", kind: "text", text: "B" },
    ]);
  });

  it("skips the children of a collapsed toggle heading", () => {
    const blocks: Block[] = [
      {
        id: "toggle",
        type: "toggleHeading",
        props: { collapsed: true, level: 3, text: "More" },
      },
      { id: "inner", type: "text", parentId: "toggle", props: { text: "Hi" } },
    ];

    expect(pageLinkPreviewLines(blocks)).toEqual([
      { id: "toggle", kind: "heading", level: 3, text: "More" },
    ]);
  });
});

describe("buildPageLinkPreviewBody", () => {
  it("counts the lines it withholds rather than dropping them silently", () => {
    const blocks: Block[] = Array.from({ length: 10 }, (_, index) => ({
      id: `t${index}`,
      type: "text" as const,
      props: { text: `Line ${index}` },
    }));

    const body = buildPageLinkPreviewBody(blocks, 4);

    expect(body.lines).toHaveLength(4);
    expect(body.lines.at(-1)).toEqual({
      id: "t3",
      kind: "text",
      text: "Line 3",
    });
    expect(body.hiddenCount).toBe(6);
  });

  it("reports nothing hidden when the whole page fits", () => {
    const blocks: Block[] = [{ id: "a", type: "text", props: { text: "A" } }];

    expect(buildPageLinkPreviewBody(blocks, 4)).toEqual({
      hiddenCount: 0,
      lines: [{ id: "a", kind: "text", text: "A" }],
    });
  });

  it("returns an empty body for a page with nothing on it", () => {
    expect(buildPageLinkPreviewBody([])).toEqual({
      hiddenCount: 0,
      lines: [],
    });
  });
});
