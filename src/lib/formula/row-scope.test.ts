import { describe, expect, it } from "vitest";

import { formulaValueToDisplay } from "@/lib/formula/display.ts";
import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import {
  createFormulaRowScope,
  type ResolvedFormulaValues,
} from "@/lib/formula/row-scope.ts";
import {
  FormulaDate,
  type FormulaValue,
  formulaError,
  isFormulaError,
} from "@/lib/formula/values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";

const fields: DatabaseField[] = [
  { id: "f-name", name: "Name", type: "text" },
  { id: "f-amount", name: "Amount", type: "number" },
  { id: "f-done", name: "Done", type: "checkbox" },
  {
    id: "f-status",
    name: "Status",
    options: [
      { id: "opt-a", name: "Active" },
      { id: "opt-p", name: "Paused" },
    ],
    type: "select",
  },
  {
    id: "f-tags",
    name: "Tags",
    options: [
      { id: "opt-x", name: "Alpha" },
      { id: "opt-y", name: "Beta" },
    ],
    type: "multiSelect",
  },
  { id: "f-due", name: "Due Date", type: "date" },
  { id: "f-site", name: "Site", type: "url" },
  { expression: "1 + 1", id: "f-total", name: "Total", type: "formula" },
];

const values: Record<string, DatabaseCellValue> = {
  "f-amount": 12.5,
  "f-done": true,
  "f-due": "2026-03-05T09:00:00Z",
  "f-name": "Ada",
  "f-site": "https://example.com",
  "f-status": "opt-a",
  "f-tags": ["opt-x", "opt-y"],
};

function run(
  source: string,
  rowValues: Record<string, DatabaseCellValue> = values,
  resolved?: ResolvedFormulaValues
): FormulaValue {
  const parsed = parseFormula(source);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return evaluateFormula(
    parsed.ast,
    createFormulaRowScope(fields, rowValues, resolved)
  );
}

function errorMessage(value: FormulaValue): string {
  if (!isFormulaError(value)) {
    throw new Error(`expected a FormulaError, got ${JSON.stringify(value)}`);
  }
  return value.message;
}

describe("createFormulaRowScope name resolution", () => {
  it("resolves by exact field name", () => {
    expect(run("thisPage.Name")).toBe("Ada");
    expect(run("thisPage.Amount")).toBe(12.5);
  });

  it("resolves case-insensitively and trims", () => {
    expect(run("thisPage.name")).toBe("Ada");
    expect(run("thisPage.AMOUNT")).toBe(12.5);
    expect(run('thisPage["  name  "]')).toBe("Ada");
  });

  it("resolves bracket access for names with spaces", () => {
    // v2: date cells are FormulaDate values (date-only), not ISO strings.
    const due = run('thisPage["Due Date"]');
    expect(due).toBeInstanceOf(FormulaDate);
    expect(formulaValueToDisplay(due)).toBe("2026-03-05");
    expect(formulaValueToDisplay(run('thisPage["due date"]'))).toBe(
      "2026-03-05"
    );
  });

  it("treats thisRow and thisPage as the same scope", () => {
    expect(run("thisRow.Name")).toBe(run("thisPage.Name"));
  });

  it("errors on unknown properties without throwing", () => {
    expect(errorMessage(run("thisPage.Nope"))).toBe('Unknown property "Nope"');
  });

  it("prefers the first field when names collide", () => {
    const clashing: DatabaseField[] = [
      { id: "a", name: "Score", type: "number" },
      { id: "b", name: "score", type: "text" },
    ];
    const parsed = parseFormula("thisPage.Score");
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const scope = createFormulaRowScope(clashing, { a: 1, b: "two" });
    expect(evaluateFormula(parsed.ast, scope)).toBe(1);
  });
});

describe("createFormulaRowScope id resolution", () => {
  it("resolves prop() references by exact field id", () => {
    expect(run('prop("f-name")')).toBe("Ada");
    expect(run('prop("f-amount") * 2')).toBe(25);
  });

  it("prefers an exact id match over a name match", () => {
    const clashing: DatabaseField[] = [
      { id: "score", name: "Points", type: "number" },
      { id: "other", name: "score", type: "text" },
    ];
    const parsed = parseFormula('prop("score")');
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const scope = createFormulaRowScope(clashing, { score: 7, other: "text" });
    expect(evaluateFormula(parsed.ast, scope)).toBe(7);
  });

  it("falls back to name matching for prop() refs that are not ids", () => {
    expect(run('prop("Amount")')).toBe(12.5);
  });

  it("errors on unknown ids without throwing", () => {
    expect(errorMessage(run('prop("f-gone")'))).toBe(
      'Unknown property "f-gone"'
    );
  });

  it("does not trim or case-fold id matches", () => {
    // "F-NAME" is no field id; it falls through to name matching and misses.
    expect(errorMessage(run('prop("F-NAME")'))).toBe(
      'Unknown property "F-NAME"'
    );
  });
});

describe("createFormulaRowScope value mapping", () => {
  it("maps text, url, number, and checkbox directly", () => {
    expect(run("thisPage.Name")).toBe("Ada");
    expect(run("thisPage.Site")).toBe("https://example.com");
    expect(run("thisPage.Amount")).toBe(12.5);
    expect(run("thisPage.Done")).toBe(true);
  });

  it("resolves select option ids to option names", () => {
    expect(run("thisPage.Status")).toBe("Active");
    expect(run('thisPage.Status == "Active"')).toBe(true);
  });

  it("drops stale select option ids to empty text", () => {
    expect(run("thisPage.Status", { ...values, "f-status": "opt-gone" })).toBe(
      ""
    );
  });

  it("maps multiSelect cells to lists of option names", () => {
    // v2: multiSelect is a real list<text> (v1 comma-joined into one string).
    expect(run("thisPage.Tags")).toEqual(["Alpha", "Beta"]);
    expect(formulaValueToDisplay(run("thisPage.Tags"))).toBe("Alpha, Beta");
    // contains() on a list checks membership (== semantics).
    expect(run('contains(thisPage.Tags, "Beta")')).toBe(true);
    expect(run('contains(thisPage.Tags, "Bet")')).toBe(false);
  });

  it("compares date cells as date values", () => {
    // v2: dates compare with dates (v1 compared ISO date strings
    // lexically); a raw text comparand is a type error, not a coercion.
    expect(run('thisPage["Due Date"] < parseDate("2026-04-01")')).toBe(true);
    expect(errorMessage(run('thisPage["Due Date"] < "2026-04-01"'))).toContain(
      "Cannot compare"
    );
  });

  it("maps missing and null cells to null", () => {
    expect(run("thisPage.Name", {})).toBeNull();
    expect(run("thisPage.Done", {})).toBeNull();
    expect(run("thisPage.Amount", { "f-amount": null })).toBeNull();
    expect(run("empty(thisPage.Status)", {})).toBe(true);
  });

  it("collapses wrong-shaped stored values to null", () => {
    expect(run("thisPage.Amount", { "f-amount": "not a number" })).toBeNull();
    expect(run("thisPage.Done", { "f-done": "yes" })).toBeNull();
    expect(run("thisPage.Tags", { "f-tags": "opt-x" })).toBeNull();
  });

  it("supports realistic formulas over the row", () => {
    expect(run('if(thisPage.Done, "✓ ", "") + thisPage.Name')).toBe("✓ Ada");
    expect(run("round(thisPage.Amount * 2, 0)")).toBe(25);
  });
});

describe("createFormulaRowScope formula references", () => {
  // v2: formulas may reference other formulas — the overlay threads a
  // `resolved` map of already-computed values through the scope (v1 refused
  // with "Formulas cannot reference other formulas yet").
  it("reads formula fields from the resolved map by name and id", () => {
    const resolved = new Map<string, FormulaValue>([["f-total", 2]]);
    expect(run("thisPage.Total + 1", values, resolved)).toBe(3);
    expect(run('prop("f-total") * 10', values, resolved)).toBe(20);
  });

  it("reads a formula field absent from the map as blank", () => {
    expect(run("thisPage.Total", values, new Map())).toBeNull();
    expect(run("thisPage.Total")).toBeNull();
  });

  it("propagates error values placed in the map (cycle members)", () => {
    const resolved = new Map<string, FormulaValue>([
      ["f-total", formulaError("Circular reference: Total → Total")],
    ]);
    expect(errorMessage(run("thisPage.Total + 1", values, resolved))).toBe(
      "Circular reference: Total → Total"
    );
  });
});

describe("createFormulaRowScope clock injection", () => {
  it("passes opts.now through to now()/today()", () => {
    const parsed = parseFormula("now()");
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const scope = createFormulaRowScope(fields, values, undefined, {
      now: () => new Date("2026-07-04T10:00:00.000Z"),
    });
    const result = evaluateFormula(parsed.ast, scope);
    expect(result).toBeInstanceOf(FormulaDate);
    expect((result as FormulaDate).date.toISOString()).toBe(
      "2026-07-04T10:00:00.000Z"
    );
  });

  it("stays deterministic without an injected clock", () => {
    const parsed = parseFormula("now()");
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const result = evaluateFormula(
      parsed.ast,
      createFormulaRowScope(fields, values)
    );
    expect(result).toBeInstanceOf(FormulaDate);
    expect((result as FormulaDate).date.toISOString()).toBe(
      "2020-01-01T12:00:00.000Z"
    );
  });
});
