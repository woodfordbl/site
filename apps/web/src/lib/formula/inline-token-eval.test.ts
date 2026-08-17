import { describe, expect, it } from "vitest";

import { formulaTokenMark } from "@/lib/blocks/inline-formula.ts";
import type { FormulaCheckContext } from "@/lib/formula/check.ts";
import { EMPTY_INLINE_FORMULA_LABEL } from "@/lib/formula/display.ts";
import { evaluateInlineTokens } from "@/lib/formula/inline-token-eval.ts";
import {
  createPageFormulaScope,
  type PageFormulaSource,
  pageFormulaCheckProperties,
} from "@/lib/formula/page-scope.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";

const PAGE: PageFormulaSource = {
  title: "Weekly notes",
  createdAt: "2026-01-05T09:30:00.000Z",
  updatedAt: "2026-08-11T12:00:00.000Z",
};

const CONTEXT: FormulaCheckContext = {
  properties: pageFormulaCheckProperties(),
  databases: new Map([
    [
      "db-tasks",
      {
        name: "Tasks",
        properties: [
          {
            id: "t-est",
            kind: "number" as const,
            name: "Estimate",
            type: { kind: "number" as const },
          },
        ],
      },
    ],
  ]),
};

/** Two rows in db-tasks, so whole-database `db()` reads resolve. */
const SCOPE = createPageFormulaScope(PAGE, {
  relations: {
    database: (databaseId: string) =>
      databaseId === "db-tasks"
        ? { id: "db-tasks", name: "Tasks", properties: [] }
        : null,
    rowIds: (databaseId: string) =>
      databaseId === "db-tasks" ? ["r1", "r2"] : null,
  } as never,
});

function evaluate(marks: readonly InlineMark[]) {
  return evaluateInlineTokens(marks, SCOPE, CONTEXT);
}

describe("evaluateInlineTokens", () => {
  it("returns nothing for a block with no tokens", () => {
    const result = evaluate([{ type: "bold", start: 0, end: 4 }]);
    expect(result.values.size).toBe(0);
    expect(result.databaseIds.size).toBe(0);
    expect(result.volatile).toBe(false);
  });

  it("evaluates a page-scoped token", () => {
    const result = evaluate([formulaTokenMark(0, "thisPage.Title")]);
    expect(result.values.get(0)).toBe("Weekly notes");
  });

  it("reports thisRow as an unknown name — it is not part of the language", () => {
    const result = evaluateInlineTokens(
      [formulaTokenMark(0, "thisRow")],
      SCOPE,
      CONTEXT
    );
    expect(result.values.get(0)).toContain('Unknown name "thisRow"');
  });

  it("keys values by the mark's start offset", () => {
    const result = evaluate([
      formulaTokenMark(0, '"a"'),
      formulaTokenMark(4, '"b"'),
    ]);
    expect(result.values.get(0)).toBe("a");
    expect(result.values.get(4)).toBe("b");
  });

  it("reports a parse error as the token's value, not as a throw", () => {
    const result = evaluate([formulaTokenMark(0, "1 +")]);
    expect(result.values.get(0)).toContain("⚠");
  });

  it("isolates a broken token from a healthy one in the same block", () => {
    const result = evaluate([
      formulaTokenMark(0, "1 +"),
      formulaTokenMark(2, "2 * 21"),
    ]);
    expect(result.values.get(0)).toContain("⚠");
    expect(result.values.get(2)).toBe("42");
  });

  it("collects the databases a db() token reads, for subscription", () => {
    const result = evaluate([formulaTokenMark(0, 'count(db("db-tasks"))')]);
    expect([...result.databaseIds]).toEqual(["db-tasks"]);
    expect(result.values.get(0)).toBe("2");
  });

  it("reads no databases for a token that only touches the page", () => {
    const result = evaluate([formulaTokenMark(0, "thisPage.Title")]);
    expect(result.databaseIds.size).toBe(0);
  });

  it("flags a clock-reading token so the caller joins the volatile tick", () => {
    expect(evaluate([formulaTokenMark(0, "today()")]).volatile).toBe(true);
    expect(evaluate([formulaTokenMark(0, '"static"')]).volatile).toBe(false);
  });

  it("stays volatile when any one token of several reads the clock", () => {
    const result = evaluate([
      formulaTokenMark(0, '"static"'),
      formulaTokenMark(2, "now()"),
    ]);
    expect(result.volatile).toBe(true);
  });

  it("skips a formula mark with a blank or missing expression", () => {
    const blank: InlineMark = {
      type: "formula",
      start: 0,
      end: 1,
      expression: "  ",
    };
    const missing: InlineMark = { type: "formula", start: 2, end: 3 };
    const result = evaluate([blank, missing]);
    expect(result.values.size).toBe(0);
  });

  it("shows None for a blank page title so the chip stays visible", () => {
    const emptyPage: PageFormulaSource = {
      title: "",
      createdAt: PAGE.createdAt,
      updatedAt: PAGE.updatedAt,
    };
    const result = evaluateInlineTokens(
      [formulaTokenMark(0, "thisPage.Title")],
      createPageFormulaScope(emptyPage),
      CONTEXT
    );
    expect(result.values.get(0)).toBe(EMPTY_INLINE_FORMULA_LABEL);
  });
});
