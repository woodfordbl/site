import { describe, expect, it } from "vitest";

import {
  type ExprValue,
  evaluateExpression,
  isExprError,
} from "@/lib/expr/evaluate.ts";
import { parseExpression } from "@/lib/expr/parse.ts";
import { createRowScope } from "@/lib/expr/row-scope.ts";
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
  rowValues: Record<string, DatabaseCellValue> = values
): ExprValue {
  const parsed = parseExpression(source);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return evaluateExpression(parsed.ast, createRowScope(fields, rowValues));
}

function errorMessage(value: ExprValue): string {
  if (!isExprError(value)) {
    throw new Error(`expected an ExprError, got ${JSON.stringify(value)}`);
  }
  return value.message;
}

describe("createRowScope name resolution", () => {
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
    expect(run('thisPage["Due Date"]')).toBe("2026-03-05");
    expect(run('thisPage["due date"]')).toBe("2026-03-05");
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
    const parsed = parseExpression("thisPage.Score");
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const scope = createRowScope(clashing, { a: 1, b: "two" });
    expect(evaluateExpression(parsed.ast, scope)).toBe(1);
  });
});

describe("createRowScope value mapping", () => {
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

  it("joins multiSelect option names with commas", () => {
    expect(run("thisPage.Tags")).toBe("Alpha, Beta");
    expect(run('contains(thisPage.Tags, "Beta")')).toBe(true);
  });

  it("reduces dates to their ISO date part for lexical comparison", () => {
    expect(run('thisPage["Due Date"] < "2026-04-01"')).toBe(true);
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

describe("createRowScope formula references", () => {
  it("rejects referencing a formula field by name", () => {
    expect(errorMessage(run("thisPage.Total"))).toBe(
      "Formulas cannot reference other formulas yet"
    );
  });

  it("rejects case-insensitive formula references too", () => {
    expect(errorMessage(run("thisPage.total + 1"))).toBe(
      "Formulas cannot reference other formulas yet"
    );
  });
});

describe("createRowScope clock injection", () => {
  it("passes opts.now through to now()/today()", () => {
    const parsed = parseExpression("now()");
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const scope = createRowScope(fields, values, {
      now: () => new Date("2026-07-04T10:00:00.000Z"),
    });
    expect(evaluateExpression(parsed.ast, scope)).toBe(
      "2026-07-04T10:00:00.000Z"
    );
  });

  it("stays deterministic without an injected clock", () => {
    const parsed = parseExpression("now()");
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    const scope = createRowScope(fields, values);
    expect(evaluateExpression(parsed.ast, scope)).toBe(
      "2020-01-01T12:00:00.000Z"
    );
  });
});
