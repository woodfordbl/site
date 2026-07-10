import { describe, expect, it } from "vitest";

import {
  type FormulaHighlightSpan,
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
