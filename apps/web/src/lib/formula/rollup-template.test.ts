import { describe, expect, it } from "vitest";

import { parseFormula } from "@/lib/formula/parse.ts";
import {
  formulaRollupAggregationsFor,
  formulaRollupExpression,
} from "@/lib/formula/rollup-template.ts";
import {
  BLANK_TYPE,
  BOOLEAN_TYPE,
  DATE_TYPE,
  listTypeOf,
  NUMBER_TYPE,
  TEXT_TYPE,
  UNKNOWN_TYPE,
  unionTypeOf,
} from "@/lib/formula/types.ts";

const generated = formulaRollupExpression;

describe("formulaRollupExpression", () => {
  it("emits parseable text for every aggregation and hostile member name", () => {
    // The sugar can't emit syntax errors — sweep the whole matrix.
    const aggregations = [
      ...formulaRollupAggregationsFor(NUMBER_TYPE),
      ...formulaRollupAggregationsFor(DATE_TYPE),
      ...formulaRollupAggregationsFor(BOOLEAN_TYPE),
      ...formulaRollupAggregationsFor(null),
    ].map((option) => option.id);
    const memberNames = [
      "Estimate",
      "Story Points",
      "3rd Qtr",
      'Say "hi"',
      "not",
      "prop",
      null,
    ];
    for (const aggregation of aggregations) {
      for (const memberName of memberNames) {
        const text = generated({
          aggregation,
          memberName,
          relationFieldId: "rel-1",
        });
        expect(parseFormula(text).ok, text).toBe(true);
      }
    }
  });

  it("generates the numeric aggregations over a mapped member", () => {
    expect(
      generated({
        aggregation: "sum",
        memberName: "Estimate",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r.Estimate).sum()');
    expect(
      generated({
        aggregation: "average",
        memberName: "Estimate",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r.Estimate).average()');
    expect(
      generated({
        aggregation: "min",
        memberName: "Estimate",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r.Estimate).min()');
    expect(
      generated({
        aggregation: "max",
        memberName: "Estimate",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r.Estimate).max()');
  });

  it("generates date aggregations with blank-safe ordering", () => {
    expect(
      generated({
        aggregation: "earliest",
        memberName: "Due",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r.Due).sort().first()');
    expect(
      generated({
        aggregation: "latest",
        memberName: "Due",
        relationFieldId: "rel-1",
      })
    ).toBe(
      'prop("rel-1").map(r => r.Due).filter(v => !empty(v)).sort().last()'
    );
  });

  it("generates checkbox and generic counts", () => {
    expect(
      generated({
        aggregation: "countChecked",
        memberName: "Done",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").filter(r => r.Done).length()');
    expect(
      generated({
        aggregation: "countValues",
        memberName: "Note",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r.Note).filter(v => !empty(v)).length()');
    expect(
      generated({
        aggregation: "countAll",
        memberName: null,
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").length()');
  });

  it("generates showAll as the bare mapped list", () => {
    expect(
      generated({
        aggregation: "showAll",
        memberName: "Note",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r.Note)');
  });

  it("emits the bracket member form for non-identifier names", () => {
    expect(
      generated({
        aggregation: "sum",
        memberName: "Story Points",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r["Story Points"]).sum()');
    // Digits-first, punctuation, and embedded quotes all need the escape.
    expect(
      generated({
        aggregation: "sum",
        memberName: "3rd Qtr",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r["3rd Qtr"]).sum()');
    expect(
      generated({
        aggregation: "showAll",
        memberName: 'Say "hi"',
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r["Say \\"hi\\""])');
  });

  it("brackets member names the grammar reads specially", () => {
    // `not` would lex as the keyword operator after `.` — must be bracketed.
    expect(
      generated({
        aggregation: "showAll",
        memberName: "not",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r["not"])');
    expect(
      generated({
        aggregation: "showAll",
        memberName: "prop",
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").map(r => r["prop"])');
  });

  it("falls back to a row count when no member is picked", () => {
    // The function is total: null member always counts, whatever the
    // aggregation says.
    expect(
      generated({
        aggregation: "sum",
        memberName: null,
        relationFieldId: "rel-1",
      })
    ).toBe('prop("rel-1").length()');
  });
});

describe("formulaRollupAggregationsFor", () => {
  const ids = (type: Parameters<typeof formulaRollupAggregationsFor>[0]) =>
    formulaRollupAggregationsFor(type).map((option) => option.id);

  it("offers numeric aggregations for number members", () => {
    expect(ids(NUMBER_TYPE)).toEqual([
      "sum",
      "average",
      "min",
      "max",
      "countValues",
      "showAll",
    ]);
  });

  it("ignores blank union members when settling the kind", () => {
    // An `if(x, 1)` formula member is number|blank and still numeric.
    expect(ids(unionTypeOf(NUMBER_TYPE, BLANK_TYPE))).toContain("sum");
  });

  it("offers date, checkbox, and generic sets by kind", () => {
    expect(ids(DATE_TYPE)).toEqual([
      "earliest",
      "latest",
      "countValues",
      "showAll",
    ]);
    expect(ids(BOOLEAN_TYPE)).toEqual([
      "countChecked",
      "countValues",
      "showAll",
    ]);
    expect(ids(TEXT_TYPE)).toEqual(["countValues", "showAll"]);
    expect(ids(UNKNOWN_TYPE)).toEqual(["countValues", "showAll"]);
    expect(ids(listTypeOf(NUMBER_TYPE))).toEqual(["countValues", "showAll"]);
  });

  it("offers only the row count without a member", () => {
    expect(ids(null)).toEqual(["countAll"]);
  });
});
