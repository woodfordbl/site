import { describe, expect, it } from "vitest";

import { scanExpressionSegments } from "@/lib/expr/highlight.ts";

/** Compact "class:text" rendering so classification reads at a glance. */
function classes(source: string): string[] {
  return scanExpressionSegments(source).map(
    (segment) => `${segment.className}:${segment.text}`
  );
}

describe("scanExpressionSegments", () => {
  it("classifies numbers, strings, operators, and punctuation", () => {
    expect(classes('1 + 2.5 * "x"')).toEqual([
      "number:1",
      "text: ",
      "operator:+",
      "text: ",
      "number:2.5",
      "text: ",
      "operator:*",
      "text: ",
      'string:"x"',
    ]);
  });

  it("classifies functions vs variables vs keywords", () => {
    expect(classes("round(x)")).toEqual([
      "function:round",
      "punctuation:(",
      "variable:x",
      "punctuation:)",
    ]);
    expect(classes("true and not false")).toEqual([
      "keyword:true",
      "text: ",
      "operator:and",
      "text: ",
      "operator:not",
      "text: ",
      "keyword:false",
    ]);
  });

  it("coalesces thisPage.Field into a property segment", () => {
    expect(classes("thisPage.Weight")).toEqual(["property:thisPage.Weight"]);
    const [segment] = scanExpressionSegments("thisPage.Weight");
    expect(segment.propertyName).toBe("Weight");
  });

  it("treats Page/Row as property scope roots too", () => {
    expect(classes("Page.Weight")).toEqual(["property:Page.Weight"]);
    expect(classes("Row.Weight")).toEqual(["property:Row.Weight"]);
    const [segment] = scanExpressionSegments("Page.Weight");
    expect(segment.propertyName).toBe("Weight");
  });

  it("handles the bracket property form and captures the name", () => {
    const segments = scanExpressionSegments('thisRow["Unit Price"] + 1');
    expect(segments[0]).toMatchObject({
      className: "property",
      propertyName: "Unit Price",
      text: 'thisRow["Unit Price"]',
    });
  });

  it("keeps a bare scope root as a variable until an access is typed", () => {
    expect(classes("thisPage")).toEqual(["variable:thisPage"]);
    expect(classes("thisPage.")).toEqual([
      "variable:thisPage",
      "punctuation:.",
    ]);
  });

  it("colors two-char operators and multi-arg calls", () => {
    expect(classes("thisPage.A >= 10")).toEqual([
      "property:thisPage.A",
      "text: ",
      "operator:>=",
      "text: ",
      "number:10",
    ]);
  });

  it("never fails on an unterminated string (colors it as a string)", () => {
    expect(classes('concat("dra')).toEqual([
      "function:concat",
      "punctuation:(",
      'string:"dra',
    ]);
  });

  it("tiles the whole source contiguously for a complex formula", () => {
    const source =
      "if(thisPage.Weight > 0, round(thisPage.Weight * 0.95), 180)";
    let cursor = 0;
    for (const segment of scanExpressionSegments(source)) {
      expect(segment.start).toBe(cursor);
      expect(segment.text).toBe(source.slice(segment.start, segment.end));
      cursor = segment.end;
    }
    expect(cursor).toBe(source.length);
  });

  it("returns nothing for empty source", () => {
    expect(scanExpressionSegments("")).toEqual([]);
  });
});
