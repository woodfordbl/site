import { describe, expect, it } from "vitest";

import {
  computeFormulaOverlay,
  formulaCellErrorDisplay,
  formulaDisplayInfo,
  hasVolatileFormula,
  withFormulaValues,
} from "@/lib/databases/formula-values.ts";
import { computeAggregate } from "@/lib/databases/row-aggregate.ts";
import { rowMatchesCondition } from "@/lib/databases/row-filter.ts";
import { applySorts } from "@/lib/databases/row-sort.ts";
import type { FormulaRelationResolver } from "@/lib/formula/values.ts";
import type {
  DatabaseField,
  DatabaseFilterOperator,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const nameField: DatabaseField = { id: "f-name", name: "Name", type: "text" };
const priceField: DatabaseField = {
  id: "f-price",
  name: "Price",
  type: "number",
};

function formulaField(id: string, expression: string): DatabaseField {
  return { id, name: `Formula ${id}`, type: "formula", expression };
}

function row(id: string, values: LocalDatabaseRow["values"]): LocalDatabaseRow {
  return {
    id,
    databaseId: "db",
    values,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const ROWS = [
  row("r1", { "f-name": "Widget", "f-price": 10 }),
  row("r2", { "f-name": "Gadget", "f-price": 4 }),
  row("r3", { "f-name": "Doohickey" }),
];

function condition(operator: DatabaseFilterOperator, value?: string | number) {
  return { id: "c1", fieldId: "f-total", operator, value };
}

describe("computeFormulaOverlay", () => {
  it("evaluates each formula field per row and records value + display", () => {
    const total = formulaField("f-total", "thisPage.Price * 2");
    const overlay = computeFormulaOverlay([nameField, priceField, total], ROWS);

    expect(overlay.get("r1")?.["f-total"]).toEqual({
      cellValue: 20,
      display: "20",
      isError: false,
    });
    expect(overlay.get("r2")?.["f-total"]).toEqual({
      cellValue: 8,
      display: "8",
      isError: false,
    });
    // Empty Price → null * 2 → arithmetic over empty yields an error value.
    expect(overlay.get("r3")?.["f-total"].cellValue).toBeNull();
  });

  it("collapses evaluation errors to null cells with a ⚠ display", () => {
    const broken = formulaField("f-b", "thisPage.Name * 2");
    const overlay = computeFormulaOverlay([nameField, broken], ROWS);
    const result = overlay.get("r1")?.["f-b"];

    expect(result?.cellValue).toBeNull();
    expect(result?.isError).toBe(true);
    expect(result?.display.startsWith("⚠ ")).toBe(true);
  });

  // v2: formulas may reference other formulas — evaluation is column-major
  // in topological order (v1 refused with a per-cell guard error).
  it("evaluates formula→formula references through the dependency order", () => {
    const subtotal: DatabaseField = {
      id: "f-sub",
      name: "Subtotal",
      type: "formula",
      expression: "thisPage.Price * 2",
    };
    const total: DatabaseField = {
      id: "f-tot",
      name: "Total",
      type: "formula",
      expression: "thisPage.Subtotal + 1",
    };
    // Total listed BEFORE Subtotal: schema order must not matter.
    const overlay = computeFormulaOverlay(
      [priceField, total, subtotal],
      ROWS.slice(0, 2)
    );

    expect(overlay.get("r1")?.["f-sub"].cellValue).toBe(20);
    expect(overlay.get("r1")?.["f-tot"].cellValue).toBe(21);
    expect(overlay.get("r2")?.["f-sub"].cellValue).toBe(8);
    expect(overlay.get("r2")?.["f-tot"].cellValue).toBe(9);
  });

  it("reports reference cycles as per-cell errors named by field names", () => {
    const a: DatabaseField = {
      id: "f-a",
      name: "Alpha",
      type: "formula",
      expression: "thisPage.Beta + 1",
    };
    const b: DatabaseField = {
      id: "f-b",
      name: "Beta",
      type: "formula",
      expression: "thisPage.Alpha + 1",
    };
    // References INTO the cycle propagate the cycle member's error value.
    const chained = formulaField("f-chain", "thisPage.Alpha + 1");
    const overlay = computeFormulaOverlay(
      [priceField, a, b, chained],
      [ROWS[0]]
    );

    const alpha = overlay.get("r1")?.["f-a"];
    expect(alpha?.isError).toBe(true);
    expect(alpha?.cellValue).toBeNull();
    expect(alpha?.display).toBe("⚠ Circular reference: Alpha → Beta → Alpha");
    expect(overlay.get("r1")?.["f-b"].display).toBe(
      "⚠ Circular reference: Beta → Alpha → Beta"
    );
    expect(overlay.get("r1")?.["f-chain"].isError).toBe(true);
    expect(overlay.get("r1")?.["f-chain"].display).toBe(
      "⚠ Circular reference: Alpha → Beta → Alpha"
    );
  });

  it("reports a self-reference as a cycle too", () => {
    const selfRef: DatabaseField = {
      id: "f-self",
      name: "Self",
      type: "formula",
      expression: "thisPage.Self + 1",
    };
    const overlay = computeFormulaOverlay([priceField, selfRef], [ROWS[0]]);

    const cell = overlay.get("r1")?.["f-self"];
    expect(cell?.isError).toBe(true);
    expect(cell?.display).toBe("⚠ Circular reference: Self → Self");
  });

  it("maps blank and unparseable expressions to null cells for every row", () => {
    const blank = formulaField("f-blank", "   ");
    const broken = formulaField("f-broken", "1 +");
    const overlay = computeFormulaOverlay([blank, broken], ROWS);

    for (const rowId of ["r1", "r2", "r3"]) {
      expect(overlay.get(rowId)?.["f-blank"]).toEqual({
        cellValue: null,
        display: "",
        isError: false,
      });
      expect(overlay.get(rowId)?.["f-broken"].cellValue).toBeNull();
    }
  });

  it("returns an empty overlay when the schema has no formula fields", () => {
    expect(computeFormulaOverlay([nameField, priceField], ROWS).size).toBe(0);
  });

  it("injects the clock for now()/today() and stays fixed without one", () => {
    const today = formulaField("f-today", "today()");
    const fields = [today];

    const fixed = computeFormulaOverlay(fields, [ROWS[0]]);
    expect(fixed.get("r1")?.["f-today"].cellValue).toBe("2020-01-01");

    const injected = computeFormulaOverlay(fields, [ROWS[0]], {
      now: () => new Date("2026-03-05T12:00:00.000Z"),
    });
    expect(injected.get("r1")?.["f-today"].cellValue).toBe("2026-03-05");
  });
});

describe("relation rollups in the overlay", () => {
  const relationField: DatabaseField = {
    id: "f-rel",
    name: "Rel",
    targetDatabaseId: "db-t",
    type: "relation",
  };
  const targetFields: DatabaseField[] = [
    { id: "t-name", name: "Name", type: "text" },
    { id: "t-est", name: "Estimate", type: "number" },
  ];
  const targetRows: Record<string, Record<string, number | string>> = {
    r1: { "t-est": 3, "t-name": "Alpha" },
    r2: { "t-est": 4, "t-name": "Beta" },
  };
  const relations: FormulaRelationResolver = {
    database: (databaseId) =>
      databaseId === "db-t"
        ? {
            fields: targetFields,
            name: "Tasks",
            primaryFieldId: "t-name",
            row: (rowId) => targetRows[rowId] ?? null,
          }
        : null,
  };

  it("computes a relation rollup per row through the resolver", () => {
    const rollup = formulaField(
      "f-roll",
      'prop("f-rel").map(r => r.Estimate).sum()'
    );
    const rows = [
      row("a", { "f-rel": ["r1", "r2"] }),
      row("b", { "f-rel": ["r1"] }),
      // Blank relation → empty list → the rollup sums to 0, not blank.
      row("c", {}),
    ];
    const overlay = computeFormulaOverlay(
      [nameField, relationField, rollup],
      rows,
      { relations }
    );
    expect(overlay.get("a")?.["f-roll"].cellValue).toBe(7);
    expect(overlay.get("b")?.["f-roll"].cellValue).toBe(3);
    expect(overlay.get("c")?.["f-roll"]).toEqual({
      cellValue: 0,
      display: "0",
      isError: false,
    });
  });

  it("projects row lists to target titles in display and cell value", () => {
    const passthrough = formulaField("f-rows", 'prop("f-rel")');
    const overlay = computeFormulaOverlay(
      [nameField, relationField, passthrough],
      [row("a", { "f-rel": ["r1", "r2"] })],
      { relations }
    );
    expect(overlay.get("a")?.["f-rows"]).toEqual({
      cellValue: ["Alpha", "Beta"],
      display: "Alpha, Beta",
      isError: false,
    });
  });

  it("reads relation cells as blank without a resolver (legacy overlay calls)", () => {
    const rollup = formulaField("f-roll", 'prop("f-rel")');
    const overlay = computeFormulaOverlay(
      [relationField, rollup],
      [row("a", { "f-rel": ["r1"] })]
    );
    expect(overlay.get("a")?.["f-roll"]).toEqual({
      cellValue: null,
      display: "",
      isError: false,
    });
  });
});

describe("withFormulaValues", () => {
  const total = formulaField("f-total", "thisPage.Price * 2");
  const fields = [nameField, priceField, total];

  it("merges computed values into new row objects without mutating inputs", () => {
    const overlay = computeFormulaOverlay(fields, ROWS);
    const merged = withFormulaValues(ROWS, overlay);

    expect(merged[0].values["f-total"]).toBe(20);
    expect(merged[1].values["f-total"]).toBe(8);
    expect(merged[0]).not.toBe(ROWS[0]);
    expect(merged[0].values).not.toBe(ROWS[0].values);
    // Inputs untouched — formula values never live in stored rows.
    expect("f-total" in ROWS[0].values).toBe(false);
  });

  it("passes rows without overlay entries through by identity", () => {
    const overlay = computeFormulaOverlay(fields, [ROWS[0]]);
    const merged = withFormulaValues(ROWS, overlay);
    expect(merged[1]).toBe(ROWS[1]);
    expect(merged[2]).toBe(ROWS[2]);
  });

  it("shadows stale stored values under a formula field id", () => {
    const blank = formulaField("f-blank", "");
    const stale = row("r9", { "f-blank": "left over from text days" });
    const overlay = computeFormulaOverlay([blank], [stale]);
    const merged = withFormulaValues([stale], overlay);
    expect(merged[0].values["f-blank"]).toBeNull();
  });

  it("encodes evaluation errors as a marker the display layer can decode", () => {
    const broken = formulaField("f-b", "thisPage.Name * 2");
    const overlay = computeFormulaOverlay([nameField, broken], [ROWS[0]]);
    const merged = withFormulaValues([ROWS[0]], overlay);
    const cell = merged[0].values["f-b"];

    const display = formulaCellErrorDisplay(cell);
    expect(display?.startsWith("⚠ ")).toBe(true);
    // Real value shapes never read as error markers.
    expect(formulaCellErrorDisplay("⚠ not an array")).toBeNull();
    expect(formulaCellErrorDisplay(["opt-a", "opt-b"])).toBeNull();
    expect(formulaCellErrorDisplay(20)).toBeNull();
    expect(formulaCellErrorDisplay(null)).toBeNull();
  });
});

describe("merged rows in the view machinery", () => {
  const total = formulaField("f-total", "thisPage.Price * 2");
  const label = formulaField("f-total", `concat(thisPage.Name, "!")`);

  function mergedWith(field: DatabaseField): LocalDatabaseRow[] {
    const schema = [nameField, priceField, field];
    return withFormulaValues(ROWS, computeFormulaOverlay(schema, ROWS));
  }

  it("filters string formula results with the string operator set", () => {
    const merged = mergedWith(label);
    expect(
      rowMatchesCondition(merged[0], label, condition("contains", "widget"))
    ).toBe(true);
    expect(
      rowMatchesCondition(merged[1], label, condition("eq", "gadget!"))
    ).toBe(true);
    expect(rowMatchesCondition(merged[0], label, condition("isNotEmpty"))).toBe(
      true
    );
  });

  it("filters number results on their displayed text", () => {
    // Mixed-type formula columns filter as strings in v1: string operators
    // match against the display text the grid renders (here 10 * 2 → "20"),
    // and number results satisfy emptiness operators.
    const merged = mergedWith(total);
    expect(rowMatchesCondition(merged[0], total, condition("isNotEmpty"))).toBe(
      true
    );
    expect(
      rowMatchesCondition(merged[0], total, condition("contains", "20"))
    ).toBe(true);
    expect(rowMatchesCondition(merged[0], total, condition("eq", "20"))).toBe(
      true
    );
    expect(rowMatchesCondition(merged[0], total, condition("neq", "20"))).toBe(
      false
    );
    expect(rowMatchesCondition(merged[1], total, condition("eq", "20"))).toBe(
      false
    );
  });

  it("treats error and null cells as empty for filtering", () => {
    const broken = formulaField("f-total", "thisPage.Name * 2");
    const merged = mergedWith(broken);
    expect(rowMatchesCondition(merged[0], broken, condition("isEmpty"))).toBe(
      true
    );
  });

  it("computes number aggregates over a formula column's merged values", () => {
    const merged = mergedWith(total);
    expect(computeAggregate("sum", total, merged)).toBe(28);
    expect(computeAggregate("average", total, merged)).toBe(14);
    expect(computeAggregate("max", total, merged)).toBe(20);
    // r3 has no Price → its formula cell is an error → counts as empty.
    expect(computeAggregate("countNotEmpty", total, merged)).toBe(2);
    expect(computeAggregate("countEmpty", total, merged)).toBe(1);
  });

  it("sorts numeric formula results numerically with empties last", () => {
    const merged = mergedWith(total);
    const sorted = applySorts(
      merged,
      [nameField, priceField, total],
      [{ fieldId: "f-total", direction: "asc" }]
    );
    expect(sorted.map((entry) => entry.id)).toEqual(["r2", "r1", "r3"]);
  });
});

describe("formulaDisplayInfo", () => {
  it("reports parse errors for broken expressions only", () => {
    expect(formulaDisplayInfo(formulaField("f", "1 + 2"))).toEqual({});
    expect(formulaDisplayInfo(formulaField("f", ""))).toEqual({});
    expect(formulaDisplayInfo(formulaField("f", "  "))).toEqual({});
    expect(formulaDisplayInfo(nameField)).toEqual({});

    const broken = formulaDisplayInfo(formulaField("f", "1 +"));
    expect(typeof broken.parseError).toBe("string");
    expect(broken.parseError?.length).toBeGreaterThan(0);
  });
});

describe("hasVolatileFormula", () => {
  it("detects clock-dependent formulas anywhere in the schema", () => {
    expect(hasVolatileFormula([nameField, formulaField("f", "today()")])).toBe(
      true
    );
    expect(
      hasVolatileFormula([formulaField("f", 'dateAdd(now(), 1, "days")')])
    ).toBe(true);
  });

  it("reports pure, blank, and unparseable schemas as non-volatile", () => {
    expect(hasVolatileFormula([nameField, priceField])).toBe(false);
    expect(hasVolatileFormula([formulaField("f", "1 + 2")])).toBe(false);
    expect(hasVolatileFormula([formulaField("f", "")])).toBe(false);
    expect(hasVolatileFormula([formulaField("f", "now(")])).toBe(false);
  });
});
