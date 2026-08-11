import { describe, expect, it } from "vitest";

import {
  formulaTokenAt,
  formulaTokenMark,
  hasUnprojectedToken,
  insertFormulaToken,
  projectPlainText,
  setFormulaTokenExpression,
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

describe("insertFormulaToken", () => {
  it("inserts a sentinel and its mark at a collapsed caret", () => {
    const result = insertFormulaToken(
      "We have  open tasks.",
      [],
      { start: 8, end: 8 },
      "count(x)"
    );
    expect(result.text).toBe(`We have ${S} open tasks.`);
    expect(result.marks).toEqual([formulaTokenMark(8, "count(x)")]);
  });

  it("replaces a selected range with the token", () => {
    const result = insertFormulaToken(
      "Total: TBD",
      [],
      { start: 7, end: 10 },
      "sum(x)"
    );
    expect(result.text).toBe(`Total: ${S}`);
  });

  it("leaves the caret after the token, ready to keep typing", () => {
    const result = insertFormulaToken("ab", [], { start: 1, end: 1 }, "x");
    expect(result.selection).toEqual({ start: 2, end: 2 });
  });

  it("rebases marks that followed the insertion point", () => {
    const bold: InlineMark = { type: "bold", start: 4, end: 8 };
    const result = insertFormulaToken(
      "one two three",
      [bold],
      { start: 0, end: 0 },
      "x"
    );
    expect(result.marks).toContainEqual({ type: "bold", start: 5, end: 9 });
  });

  it("leaves marks before the insertion point alone", () => {
    const bold: InlineMark = { type: "bold", start: 0, end: 3 };
    const result = insertFormulaToken(
      "one two",
      [bold],
      { start: 7, end: 7 },
      "x"
    );
    expect(result.marks).toContainEqual({ type: "bold", start: 0, end: 3 });
  });

  it("does not extend a surrounding mark across the token", () => {
    // Bolding must stop at the token's edges: a mark covering half an atomic
    // run is what `normalizeInlineMarks` exists to prevent.
    const result = insertFormulaToken(
      "bold text",
      [{ type: "bold", start: 0, end: 9 }],
      { start: 4, end: 4 },
      "x"
    );
    const token = result.marks.find((mark) => mark.type === "formula");
    expect(token).toBeDefined();
    for (const mark of result.marks) {
      if (mark.type === "bold") {
        expect(mark.start >= 5 || mark.end <= 4).toBe(true);
      }
    }
  });

  it("clamps a range past the end of the text", () => {
    const result = insertFormulaToken("hi", [], { start: 99, end: 99 }, "x");
    expect(result.text).toBe(`hi${S}`);
  });

  it("keeps two tokens inserted in a row distinct", () => {
    const first = insertFormulaToken("", [], { start: 0, end: 0 }, "same");
    const second = insertFormulaToken(
      first.text,
      first.marks,
      first.selection,
      "same"
    );
    expect(second.text).toBe(`${S}${S}`);
    expect(second.marks).toHaveLength(2);
  });
});

describe("formulaTokenAt", () => {
  const marks = [formulaTokenMark(3, "a")];

  it("finds the token covering an offset", () => {
    expect(formulaTokenAt(marks, 3)?.expression).toBe("a");
  });

  it("returns null just past it — the range is half-open", () => {
    expect(formulaTokenAt(marks, 4)).toBeNull();
  });

  it("ignores marks that are not tokens", () => {
    expect(formulaTokenAt([{ type: "bold", start: 0, end: 5 }], 2)).toBeNull();
  });
});

describe("setFormulaTokenExpression", () => {
  it("rewrites the expression without touching offsets", () => {
    const marks = setFormulaTokenExpression(
      [formulaTokenMark(2, "old")],
      2,
      "new"
    );
    expect(marks).toEqual([formulaTokenMark(2, "new")]);
  });

  it("leaves other tokens alone", () => {
    const marks = setFormulaTokenExpression(
      [formulaTokenMark(0, "a"), formulaTokenMark(1, "b")],
      0,
      "z"
    );
    expect(marks.map((mark) => mark.expression)).toEqual(["z", "b"]);
  });
});
