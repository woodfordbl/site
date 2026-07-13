import { describe, expect, it } from "vitest";

import {
  type FormulaHighlightSpan,
  formulaDisplayOffset,
  formulaEnclosingCallAt,
  formulaPropIdSpans,
  highlightFormula,
} from "@/lib/formula/highlight.ts";

/** Render spans as `kind:text` pairs so expectations read at a glance. */
function spansOf(source: string): string[] {
  return highlightFormula(source).map(
    (span) => `${span.kind}:${source.slice(span.start, span.end)}`
  );
}

describe("highlightFormula", () => {
  it("classifies literals, operators, and call names", () => {
    expect(spansOf('round(1.5) + "x"')).toEqual([
      "function:round",
      "number:1.5",
      "operator:+",
      'string:"x"',
    ]);
  });

  it("keeps grouping puncts unstyled and marks word operators", () => {
    expect(spansOf("not (true and false)")).toEqual([
      "operator:not",
      "literal:true",
      "operator:and",
      "literal:false",
    ]);
  });

  it("marks list literals' contents but not the brackets", () => {
    expect(spansOf("[1, 2]")).toEqual(["number:1", "number:2"]);
  });

  it("spans a whole thisPage reference, dot and bracket forms", () => {
    expect(spansOf("thisPage.Price * 2")).toEqual([
      "property:thisPage.Price",
      "operator:*",
      "number:2",
    ]);
    expect(spansOf('thisRow["Unit Count"]')).toEqual([
      'property:thisRow["Unit Count"]',
    ]);
  });

  it("spans a whole prop() reference including the quoted id", () => {
    expect(spansOf('prop("f-price") ^ 2')).toEqual([
      'property:prop("f-price")',
      "operator:^",
      "number:2",
    ]);
  });

  it("treats prop without a quoted argument as a plain call", () => {
    expect(spansOf("prop(1)")).toEqual(["function:prop", "number:1"]);
  });

  it("classifies member access and chained method calls", () => {
    expect(spansOf("r.Estimate.round()")).toEqual([
      "name:r",
      "operator:.",
      "property:Estimate",
      "operator:.",
      "function:round",
    ]);
  });

  it("classifies lambda params and let bindings as names", () => {
    expect(spansOf("map(list, x => x + 1)")).toEqual([
      "function:map",
      "name:list",
      "name:x",
      "operator:=>",
      "name:x",
      "operator:+",
      "number:1",
    ]);
    expect(spansOf("let(tax, 0.1, tax * 2)")).toEqual([
      "function:let",
      "name:tax",
      "number:0.1",
      "name:tax",
      "operator:*",
      "number:2",
    ]);
  });

  it("recovers line and block comment spans between tokens", () => {
    expect(spansOf("1 // add\n+ 2")).toEqual([
      "number:1",
      "comment:// add",
      "operator:+",
      "number:2",
    ]);
    expect(spansOf("1 /* a b */ + 2 // tail")).toEqual([
      "number:1",
      "comment:/* a b */",
      "operator:+",
      "number:2",
      "comment:// tail",
    ]);
  });

  it("still highlights the prefix of an unlexable draft", () => {
    // Mid-keystroke unterminated string: prefix keeps its spans, tail styles
    // as a string; an unterminated block comment tail styles as a comment.
    expect(spansOf('1 + "abc')).toEqual([
      "number:1",
      "operator:+",
      'string:"abc',
    ]);
    expect(spansOf("2 /* wip")).toEqual(["number:2", "comment:/* wip"]);
  });

  it("returns sorted, non-overlapping spans for a dense expression", () => {
    const source = 'if(thisPage.Done, "yes", round(thisPage.Score))';
    const spans = highlightFormula(source);
    let previous: FormulaHighlightSpan | null = null;
    for (const span of spans) {
      expect(span.start).toBeLessThan(span.end);
      if (previous !== null) {
        expect(span.start).toBeGreaterThanOrEqual(previous.end);
      }
      previous = span;
    }
  });

  it("never throws on hostile input", () => {
    expect(highlightFormula("")).toEqual([]);
    expect(highlightFormula("@@@@")).toEqual([]);
    expect(highlightFormula("\\")).toEqual([]);
  });
});

describe("formulaPropIdSpans", () => {
  it("locates canonical prop() spans with unescaped ids", () => {
    const source = 'prop("f-a") + thisPage.B * prop("f-c\\"d")';
    expect(formulaPropIdSpans(source)).toEqual([
      { start: 0, end: 11, id: "f-a" },
      { start: 27, end: source.length, id: 'f-c"d' },
    ]);
  });

  it("skips incomplete or non-string prop calls", () => {
    expect(formulaPropIdSpans('prop("open')).toEqual([]);
    expect(formulaPropIdSpans("prop(name)")).toEqual([]);
    expect(formulaPropIdSpans('prop("a", "b")')).toEqual([]);
  });

  it("still scans the lexable prefix of unlexable input", () => {
    expect(formulaPropIdSpans('prop("f-a") + "open')).toEqual([
      { start: 0, end: 11, id: "f-a" },
    ]);
  });

  it("matches unparseable-but-lexable drafts (mid-keystroke chips)", () => {
    expect(formulaPropIdSpans('prop("f-a") +')).toEqual([
      { start: 0, end: 11, id: "f-a" },
    ]);
  });
});

describe("formulaDisplayOffset", () => {
  // `prop("f-a")` (11 chars) renders as the 5-char label "Price".
  const labels = new Map([["f-a", "Price"]]);
  const labelLength = (id: string) => labels.get(id)?.length ?? id.length;

  it("is the identity for text without canonical references", () => {
    expect(formulaDisplayOffset("1 + thisPage.X", 8, labelLength)).toBe(8);
  });

  it("shifts offsets past a span by the label/canonical length difference", () => {
    // canonical: prop("f-a") + 2   display: Price + 2
    const source = 'prop("f-a") + 2';
    expect(formulaDisplayOffset(source, 11, labelLength)).toBe(5);
    expect(formulaDisplayOffset(source, 14, labelLength)).toBe(8);
  });

  it("accumulates across multiple spans", () => {
    // canonical: prop("f-a") * prop("f-a") + 9 → display: Price * Price + 9
    const source = 'prop("f-a") * prop("f-a") + 9';
    expect(formulaDisplayOffset(source, source.length - 1, labelLength)).toBe(
      "Price * Price + ".length
    );
  });

  it("clamps offsets inside a span to the rendered label extent", () => {
    const source = 'prop("f-a") + 2';
    // 8 chars into the canonical form, but the label is only 5 long.
    expect(formulaDisplayOffset(source, 8, labelLength)).toBe(5);
    expect(formulaDisplayOffset(source, 2, labelLength)).toBe(2);
  });

  it("uses the raw id length for unknown ids (the chip's fallback label)", () => {
    // canonical: prop("f-ghost") + 1 → chip label: f-ghost
    const source = 'prop("f-ghost") + 1';
    expect(formulaDisplayOffset(source, source.length, labelLength)).toBe(
      "f-ghost + 1".length
    );
  });

  it("maps offsets in unparseable drafts (token-level spans still count)", () => {
    expect(formulaDisplayOffset('prop("f-a") +', 13, labelLength)).toBe(7);
  });
});

describe("formulaEnclosingCallAt", () => {
  const at = (source: string) => formulaEnclosingCallAt(source, source.length);

  it("returns null at the top level and inside grouping-only parens", () => {
    expect(at("1 + ")).toBeNull();
    expect(at("(1 + ")).toBeNull();
  });

  it("finds the innermost unclosed call and its argument index", () => {
    expect(at("round(")).toEqual({
      argIndex: 0,
      method: false,
      name: "round",
      position: 0,
    });
    expect(at("round(1.234, ")).toEqual({
      argIndex: 1,
      method: false,
      name: "round",
      position: 0,
    });
    expect(at("if(x, round(")).toEqual({
      argIndex: 0,
      method: false,
      name: "round",
      position: 6,
    });
  });

  it("steps back out of closed calls", () => {
    expect(at("if(round(1), ")).toEqual({
      argIndex: 1,
      method: false,
      name: "if",
      position: 0,
    });
  });

  it("looks through grouping parens to the governing call", () => {
    expect(at("round((1 + ")).toEqual({
      argIndex: 0,
      method: false,
      name: "round",
      position: 0,
    });
  });

  it("marks dot-chained calls as method sites (receiver occupies param 0)", () => {
    expect(at('"a,b".split(')).toEqual({
      argIndex: 0,
      method: true,
      name: "split",
      position: 6,
    });
  });

  it("treats list brackets as a boundary (elements aren't the argument)", () => {
    expect(at("sum([1, ")).toBeNull();
  });

  it("steps back out of closed bracket members to the governing call", () => {
    // `r["Story Points"]` opens and closes its bracket frame; the argument
    // count of the enclosing call is untouched.
    expect(at('dateDiff(r["Story Points"], ')).toEqual({
      argIndex: 1,
      method: false,
      name: "dateDiff",
      position: 0,
    });
    // An open bracket member is indistinguishable from a list mid-typing,
    // so it stays a boundary until closed.
    expect(at("sum(r[")).toBeNull();
  });

  it("does not count commas of nested closed contexts", () => {
    expect(at('dateDiff(parseDate("a"), ')).toEqual({
      argIndex: 1,
      method: false,
      name: "dateDiff",
      position: 0,
    });
  });

  it("scans the lexable prefix of unlexable input (open string mid-typing)", () => {
    // The position is inside a string — the completion source suppresses
    // completions there separately; the call scan still sees `round(`.
    expect(at('round("open')).toEqual({
      argIndex: 0,
      method: false,
      name: "round",
      position: 0,
    });
  });
});
