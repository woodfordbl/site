import { describe, expect, it } from "vitest";

import {
  formulaTokenMark,
  hasUnprojectedToken,
  projectPlainText,
} from "@/lib/blocks/inline-formula.ts";
import { normalizeInlineMarks } from "@/lib/blocks/rich-text.ts";
import {
  type InlineMark,
  FORMULA_TOKEN_SENTINEL as S,
} from "@/lib/schemas/rich-text.ts";

describe("projectPlainText", () => {
  it("replaces a token's sentinel with its value", () => {
    const text = `We have ${S} open tasks.`;
    const marks = [formulaTokenMark(8, 'count(db("t"))')];
    const values = new Map([[8, "12"]]);
    expect(projectPlainText(text, marks, { values })).toBe(
      "We have 12 open tasks."
    );
  });

  it("leaves text without tokens untouched, and identical by reference", () => {
    const text = "No tokens here.";
    expect(projectPlainText(text, [])).toBe(text);
  });

  it("projects several tokens without offsets drifting between them", () => {
    // Two tokens whose values differ in width from the sentinel: a
    // left-to-right splice would corrupt the second.
    const text = `${S} of ${S} done`;
    const marks = [formulaTokenMark(0, "a"), formulaTokenMark(5, "b")];
    const values = new Map([
      [0, "137"],
      [5, "200"],
    ]);
    expect(projectPlainText(text, marks, { values })).toBe("137 of 200 done");
  });

  it("uses a visible fallback for a token with no value", () => {
    const text = `Total: ${S}`;
    const marks = [formulaTokenMark(7, "x")];
    expect(projectPlainText(text, marks)).toBe("Total: …");
    expect(projectPlainText(text, marks, { fallback: "?" })).toBe("Total: ?");
  });

  it("never leaks a sentinel once projected", () => {
    const text = `${S} and ${S}`;
    // " and " is five characters, so the second sentinel sits at 6.
    const marks = [formulaTokenMark(0, "a"), formulaTokenMark(6, "b")];
    const projected = projectPlainText(text, marks, {
      values: new Map([[0, "1"]]),
    });
    expect(hasUnprojectedToken(projected)).toBe(false);
    expect(projected).toBe("1 and …");
  });

  it("ignores a stale mark that no longer sits on a sentinel", () => {
    // The text was edited without the mark following; splicing anyway would
    // eat a real character.
    const text = "plain text";
    const marks = [formulaTokenMark(0, "x")];
    expect(projectPlainText(text, marks)).toBe("plain text");
  });

  it("ignores non-formula marks entirely", () => {
    const text = "bold text";
    const marks: InlineMark[] = [{ type: "bold", start: 0, end: 4 }];
    expect(projectPlainText(text, marks)).toBe("bold text");
  });
});

describe("formula tokens are atomic runs", () => {
  /** `text` is `A<token>B` with a bold spanning the whole thing. */
  const TEXT = `A${S}B`;

  it("cannot be split, because a token is exactly one character", () => {
    // This is the property the sentinel design buys: a half-open range either
    // contains the token's single character or it does not, so there is no
    // "partial coverage" case for a styling mark to create. Every offset a
    // bold could take either includes [1,2) whole or misses it entirely.
    for (const [start, end] of [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ] as const) {
      const marks = normalizeInlineMarks(
        [formulaTokenMark(1, "x"), { type: "bold", start, end }],
        TEXT.length
      );
      const token = marks.find((mark) => mark.type === "formula");
      expect(token).toEqual(
        expect.objectContaining({ start: 1, end: 2, expression: "x" })
      );
    }
  });

  it("keeps a styling mark that covers the whole token", () => {
    const marks = normalizeInlineMarks(
      [formulaTokenMark(1, "x"), { type: "bold", start: 0, end: 3 }],
      TEXT.length
    );
    expect(marks).toContainEqual(
      expect.objectContaining({ type: "bold", start: 0, end: 3 })
    );
    expect(marks).toContainEqual(
      expect.objectContaining({ type: "formula", start: 1, end: 2 })
    );
  });

  it("never merges adjacent tokens with different expressions", () => {
    const marks = normalizeInlineMarks(
      [formulaTokenMark(0, "a"), formulaTokenMark(1, "b")],
      2
    );
    const tokens = marks.filter((mark) => mark.type === "formula");
    expect(tokens).toHaveLength(2);
    expect(tokens.map((mark) => mark.expression)).toEqual(["a", "b"]);
  });

  it("preserves the expression through normalization", () => {
    const marks = normalizeInlineMarks(
      [formulaTokenMark(0, 'count(db("t"))')],
      1
    );
    expect(marks[0]?.expression).toBe('count(db("t"))');
  });

  it("drops a token clamped out of range rather than keeping an empty run", () => {
    expect(normalizeInlineMarks([formulaTokenMark(5, "x")], 2)).toEqual([]);
  });
});
