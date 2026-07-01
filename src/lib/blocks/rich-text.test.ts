import { describe, expect, it } from "vitest";

import {
  concatInlineMarks,
  isMarkActive,
  normalizeInlineMarks,
  segmentRichText,
  sliceInlineMarks,
  toggleMarkInRange,
} from "@/lib/blocks/rich-text.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";

const bold = (start: number, end: number): InlineMark => ({
  type: "bold",
  start,
  end,
});

const italic = (start: number, end: number): InlineMark => ({
  type: "italic",
  start,
  end,
});

describe("normalizeInlineMarks", () => {
  it("clamps ranges to the text and drops empties", () => {
    expect(normalizeInlineMarks([bold(2, 10), bold(12, 14)], 5)).toEqual([
      bold(2, 5),
    ]);
  });

  it("merges overlapping and adjacent same-type ranges", () => {
    expect(
      normalizeInlineMarks([bold(0, 3), bold(3, 6), bold(5, 8)], 10)
    ).toEqual([bold(0, 8)]);
  });

  it("keeps different types separate", () => {
    expect(normalizeInlineMarks([bold(0, 3), italic(2, 5)], 10)).toEqual([
      bold(0, 3),
      italic(2, 5),
    ]);
  });
});

describe("sliceInlineMarks", () => {
  it("rebases marks into the slice window", () => {
    expect(sliceInlineMarks([bold(2, 8)], 4, 10)).toEqual([bold(0, 4)]);
  });

  it("drops marks outside the window", () => {
    expect(sliceInlineMarks([bold(0, 2)], 4, 10)).toEqual([]);
  });
});

describe("concatInlineMarks", () => {
  it("shifts the second block's marks by the first text length", () => {
    expect(concatInlineMarks([bold(0, 2)], 5, [italic(1, 3)], 10)).toEqual([
      bold(0, 2),
      italic(6, 8),
    ]);
  });

  it("merges marks that meet at the seam", () => {
    expect(concatInlineMarks([bold(3, 5)], 5, [bold(0, 2)], 10)).toEqual([
      bold(3, 7),
    ]);
  });
});

describe("isMarkActive", () => {
  it("is active only when the whole range is covered", () => {
    const marks = [bold(0, 4), bold(6, 10)];
    expect(isMarkActive(marks, "bold", 1, 3)).toBe(true);
    expect(isMarkActive(marks, "bold", 2, 8)).toBe(false);
  });

  it("treats a caret inside a range as active", () => {
    expect(isMarkActive([bold(0, 4)], "bold", 2, 2)).toBe(true);
    expect(isMarkActive([bold(0, 4)], "bold", 0, 0)).toBe(false);
  });
});

describe("toggleMarkInRange", () => {
  it("adds the mark when the range is not fully covered", () => {
    expect(toggleMarkInRange([bold(0, 2)], "bold", 1, 6, 10)).toEqual([
      bold(0, 6),
    ]);
  });

  it("removes the mark from a fully covered range, splitting the rest", () => {
    expect(toggleMarkInRange([bold(0, 10)], "bold", 3, 6, 10)).toEqual([
      bold(0, 3),
      bold(6, 10),
    ]);
  });

  it("leaves other mark types untouched", () => {
    expect(toggleMarkInRange([italic(0, 4)], "bold", 0, 4, 10)).toEqual([
      italic(0, 4),
      bold(0, 4),
    ]);
  });
});

describe("segmentRichText", () => {
  it("splits text at mark boundaries", () => {
    expect(segmentRichText("hello world", [bold(0, 5)])).toEqual([
      { text: "hello", marks: ["bold"] },
      { text: " world", marks: [] },
    ]);
  });

  it("stacks overlapping marks on shared segments", () => {
    expect(segmentRichText("abcdef", [bold(0, 4), italic(2, 6)])).toEqual([
      { text: "ab", marks: ["bold"] },
      { text: "cd", marks: ["bold", "italic"] },
      { text: "ef", marks: ["italic"] },
    ]);
  });

  it("returns one plain segment when there are no marks", () => {
    expect(segmentRichText("plain", [])).toEqual([
      { text: "plain", marks: [] },
    ]);
  });
});
