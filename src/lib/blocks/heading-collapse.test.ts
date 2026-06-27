import { describe, expect, it } from "vitest";

import { buildBlockTree, type CanvasRow } from "@/lib/blocks/block-tree.ts";
import {
  computeHiddenRowIds,
  headingHasCollapsibleContent,
} from "@/lib/blocks/heading-collapse.ts";
import type { Block } from "@/lib/schemas/block.ts";

function heading(id: string, level: 1 | 2 | 3 | 4, text = id): Block {
  return { id, type: "heading", props: { level, text } };
}

function text(id: string): Block {
  return { id, type: "text", props: { text: id } };
}

const collapsedIds = (...ids: string[]) => {
  const set = new Set(ids);
  return (row: CanvasRow) => set.has(row.rowId);
};

describe("computeHiddenRowIds", () => {
  it("hides following siblings until the next equal-or-higher heading", () => {
    const rows = buildBlockTree([
      heading("h2-a", 2),
      text("p1"),
      text("p2"),
      heading("h2-b", 2),
      text("p3"),
    ]);

    const hidden = computeHiddenRowIds(rows, collapsedIds("h2-a"));

    expect([...hidden]).toEqual(["p1", "p2"]);
  });

  it("hides nested lower-level headings and their content", () => {
    const rows = buildBlockTree([
      heading("h1", 1),
      text("p1"),
      heading("h2", 2),
      text("p2"),
      heading("h1-next", 1),
      text("p3"),
    ]);

    const hidden = computeHiddenRowIds(rows, collapsedIds("h1"));

    expect([...hidden]).toEqual(["p1", "h2", "p2"]);
    expect(hidden.has("h1-next")).toBe(false);
    expect(hidden.has("p3")).toBe(false);
  });

  it("hides to end of scope when nothing follows of equal-or-higher level", () => {
    const rows = buildBlockTree([heading("h2", 2), text("p1"), text("p2")]);

    const hidden = computeHiddenRowIds(rows, collapsedIds("h2"));

    expect([...hidden]).toEqual(["p1", "p2"]);
  });

  it("returns nothing when no heading is collapsed", () => {
    const rows = buildBlockTree([heading("h2", 2), text("p1")]);

    expect(computeHiddenRowIds(rows, () => false).size).toBe(0);
  });

  it("merges ranges from multiple collapsed headings", () => {
    const rows = buildBlockTree([
      heading("h2-a", 2),
      text("p1"),
      heading("h2-b", 2),
      text("p2"),
    ]);

    const hidden = computeHiddenRowIds(rows, collapsedIds("h2-a", "h2-b"));

    expect([...hidden].sort()).toEqual(["p1", "p2"]);
  });
});

describe("headingHasCollapsibleContent", () => {
  it("is true when a non-heading row follows", () => {
    const rows = buildBlockTree([heading("h2", 2), text("p1")]);
    expect(headingHasCollapsibleContent(rows, "h2")).toBe(true);
  });

  it("is true when a deeper heading follows", () => {
    const rows = buildBlockTree([heading("h1", 1), heading("h2", 2)]);
    expect(headingHasCollapsibleContent(rows, "h1")).toBe(true);
  });

  it("is false at the end of a scope", () => {
    const rows = buildBlockTree([text("p1"), heading("h2", 2)]);
    expect(headingHasCollapsibleContent(rows, "h2")).toBe(false);
  });

  it("is false when an equal-or-higher heading immediately follows", () => {
    const rows = buildBlockTree([heading("h2-a", 2), heading("h1", 1)]);
    expect(headingHasCollapsibleContent(rows, "h2-a")).toBe(false);
  });

  it("is false for a non-heading row", () => {
    const rows = buildBlockTree([text("p1"), text("p2")]);
    expect(headingHasCollapsibleContent(rows, "p1")).toBe(false);
  });
});
