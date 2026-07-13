import { describe, expect, it, vi } from "vitest";

import {
  advancedFilterIsVolatile,
  applyAdvancedFilter,
} from "@/lib/databases/advanced-row-filter.ts";
import type { FormulaOverlay } from "@/lib/databases/formula-values.ts";
import { applyFilter } from "@/lib/databases/row-filter.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import { prepareUserFunctions } from "@/lib/formula/user-functions.ts";
import type { FormulaRelationResolver } from "@/lib/formula/values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

// Wrap the real parser in a spy so the parse-once contract is observable:
// `applyAdvancedFilter` must parse the expression once per CALL, never per
// row. Everything else about parsing stays real.
vi.mock("@/lib/formula/parse.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/formula/parse.ts")>();
  return { ...actual, parseFormula: vi.fn(actual.parseFormula) };
});

const statusField: DatabaseField = {
  id: "f-status",
  name: "Status",
  type: "select",
  options: [
    { id: "opt-a", name: "Active" },
    { id: "opt-p", name: "Paused" },
  ],
};

const estimateField: DatabaseField = {
  id: "f-est",
  name: "Estimate",
  type: "number",
};

const calcField: DatabaseField = {
  id: "f-calc",
  name: "Calc",
  type: "formula",
  expression: "1 > 2",
};

const relationField: DatabaseField = {
  id: "f-rel",
  name: "Projects",
  type: "relation",
  targetDatabaseId: "db-target",
};

const fields = [statusField, estimateField, calcField, relationField];

function makeRow(
  id: string,
  values: Record<string, DatabaseCellValue>
): LocalDatabaseRow {
  return {
    id,
    databaseId: "db-1",
    values,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const rowActiveBig = makeRow("row-1", {
  "f-status": "opt-a",
  "f-est": 5,
});
const rowActiveSmall = makeRow("row-2", {
  "f-status": "opt-a",
  "f-est": 2,
});
const rowPaused = makeRow("row-3", {
  "f-status": "opt-p",
  "f-est": 8,
});
const rows = [rowActiveBig, rowActiveSmall, rowPaused];

function filterIds(
  expression: string,
  input: readonly LocalDatabaseRow[] = rows,
  overlay?: FormulaOverlay
): string[] {
  return applyAdvancedFilter(input, { expression }, { fields, overlay }).map(
    (row) => row.id
  );
}

describe("applyAdvancedFilter", () => {
  it("keeps only rows where the formula is exactly true", () => {
    expect(filterIds('prop("f-status") == "Active"')).toEqual([
      "row-1",
      "row-2",
    ]);
    expect(
      filterIds('prop("f-status") == "Active" and prop("f-est") > 3')
    ).toEqual(["row-1"]);
  });

  it("hides rows for non-boolean results (fail closed)", () => {
    // Numbers — even truthy-looking ones — are not `true`.
    expect(filterIds('prop("f-est")')).toEqual([]);
    expect(filterIds('"yes"')).toEqual([]);
  });

  it("hides rows when the formula evaluates to blank", () => {
    // No row has a value under an unknown-name-free blank read: an empty
    // text projection is blank, not true.
    const blankField: DatabaseField = {
      id: "f-note",
      name: "Note",
      type: "text",
    };
    const result = applyAdvancedFilter(
      rows,
      { expression: 'prop("f-note")' },
      {
        fields: [...fields, blankField],
      }
    );
    expect(result).toEqual([]);
  });

  it("hides rows when evaluation errors (fail closed)", () => {
    // Unknown property reference evaluates to an error value per row.
    expect(filterIds('prop("f-deleted") == "x"')).toEqual([]);
  });

  it("ignores an unparseable expression entirely (every row visible)", () => {
    expect(filterIds("1 +")).toEqual(["row-1", "row-2", "row-3"]);
  });

  it("treats a blank or missing filter as inert", () => {
    expect(filterIds("   ")).toEqual(["row-1", "row-2", "row-3"]);
    expect(
      applyAdvancedFilter(rows, undefined, { fields }).map((row) => row.id)
    ).toEqual(["row-1", "row-2", "row-3"]);
  });

  it("returns a copy, never the input array", () => {
    const inert = applyAdvancedFilter(rows, undefined, { fields });
    expect(inert).not.toBe(rows);
    expect(inert).toEqual(rows);
  });

  it("composes with the structured filter (rows must pass both)", () => {
    const structured = applyFilter(rows, fields, {
      op: "and",
      conditions: [
        {
          id: "c-1",
          fieldId: "f-status",
          operator: "eq",
          value: "opt-a",
        },
      ],
    });
    expect(structured.map((row) => row.id)).toEqual(["row-1", "row-2"]);
    const both = applyAdvancedFilter(
      structured,
      { expression: 'prop("f-est") > 3' },
      { fields }
    );
    expect(both.map((row) => row.id)).toEqual(["row-1"]);
  });

  it("reads formula fields from the provided overlay, never re-evaluating", () => {
    // The stored expression ("1 > 2") would evaluate false for every row;
    // the overlay says row-1 is true — the overlay must win.
    const overlay: FormulaOverlay = new Map([
      [
        "row-1",
        { "f-calc": { cellValue: true, display: "Yes", isError: false } },
      ],
      [
        "row-2",
        { "f-calc": { cellValue: false, display: "No", isError: false } },
      ],
      [
        "row-3",
        { "f-calc": { cellValue: null, display: "⚠ Broken", isError: true } },
      ],
    ]);
    expect(filterIds('prop("f-calc")', rows, overlay)).toEqual(["row-1"]);
    // Referencing the errored overlay cell in a comparison stays an error —
    // hidden, not visible.
    expect(filterIds('prop("f-calc") != true', rows, overlay)).toEqual([
      "row-2",
    ]);
  });

  it("filters through relation rollups via the resolver", () => {
    const targetRows: Record<string, Record<string, DatabaseCellValue>> = {
      "t-1": { "t-title": "Apollo", "t-est": 4 },
      "t-2": { "t-title": "Borealis", "t-est": 1 },
    };
    const target: FormulaRelationResolver = {
      database: (databaseId) =>
        databaseId === "db-target"
          ? {
              fields: [
                { id: "t-title", name: "Name", type: "text" },
                { id: "t-est", name: "Estimate", type: "number" },
              ],
              name: "Targets",
              primaryFieldId: "t-title",
              row: (rowId) => targetRows[rowId] ?? null,
            }
          : null,
    };
    const linked = makeRow("row-l", { "f-rel": ["t-1", "t-2"] });
    const unlinked = makeRow("row-u", {});
    const result = applyAdvancedFilter(
      [linked, unlinked],
      { expression: 'prop("f-rel").map(r => r.Estimate).sum() > 3' },
      { fields, relations: target }
    );
    expect(result.map((row) => row.id)).toEqual(["row-l"]);
  });

  it("filters through user-defined functions", () => {
    const userFunctions = prepareUserFunctions([
      {
        name: "isBig",
        params: ["n"],
        expression: "n > 3",
      },
    ]);
    const result = applyAdvancedFilter(
      rows,
      { expression: 'isBig(prop("f-est"))' },
      { fields, userFunctions }
    );
    expect(result.map((row) => row.id)).toEqual(["row-1", "row-3"]);
  });

  it("parses the expression once per call, not per row", () => {
    vi.mocked(parseFormula).mockClear();
    filterIds('prop("f-est") > 3');
    // The filter's own parse is the only one on this path (row evaluation
    // never re-parses).
    expect(parseFormula).toHaveBeenCalledTimes(1);
  });
});

describe("advancedFilterIsVolatile", () => {
  it("is true only for parseable clock-dependent expressions", () => {
    expect(advancedFilterIsVolatile({ expression: "today() > today()" })).toBe(
      true
    );
    expect(advancedFilterIsVolatile({ expression: 'prop("f-est") > 3' })).toBe(
      false
    );
    expect(advancedFilterIsVolatile({ expression: "now() >" })).toBe(false);
    expect(advancedFilterIsVolatile({ expression: "  " })).toBe(false);
    expect(advancedFilterIsVolatile(undefined)).toBe(false);
  });

  it("sees now() inside user-function bodies", () => {
    const userFunctions = prepareUserFunctions([
      { name: "fresh", params: [], expression: "now()" },
    ]);
    expect(
      advancedFilterIsVolatile(
        { expression: "fresh() > fresh()" },
        userFunctions
      )
    ).toBe(true);
  });
});
