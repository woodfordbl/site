import { describe, expect, it, vi } from "vitest";

import {
  changedFormulaExpressions,
  migrateFormulaExpressionsToIdRefs,
} from "@/db/queries/formula-ref-migration.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

function makeDatabase(overrides: Partial<LocalDatabase>): LocalDatabase {
  return {
    id: "db-1",
    name: "Tasks",
    primaryFieldId: "f-name",
    fields: [],
    views: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const NAME_REF_DATABASE = makeDatabase({
  fields: [
    { id: "f-name", name: "Name", type: "text" },
    { id: "f-price", name: "Price", type: "number" },
    {
      id: "f-total",
      name: "Total",
      type: "formula",
      expression: "thisPage.Price * 2",
    },
    {
      id: "f-tax",
      name: "Tax",
      type: "formula",
      expression: 'prop("f-price") + 1',
    },
  ],
});

describe("changedFormulaExpressions", () => {
  it("canonicalizes name references and skips already-canonical fields", () => {
    expect(changedFormulaExpressions(NAME_REF_DATABASE)).toEqual(
      new Map([["f-total", 'prop("f-price") * 2']])
    );
  });

  it("reports nothing for a database without formula fields", () => {
    const database = makeDatabase({
      fields: [{ id: "f-name", name: "Name", type: "text" }],
    });
    expect(changedFormulaExpressions(database).size).toBe(0);
  });

  it("tolerates unresolvable names and unparseable expressions", () => {
    const database = makeDatabase({
      fields: [
        { id: "f-a", name: "A", type: "formula", expression: "thisPage.Gone" },
        { id: "f-b", name: "B", type: "formula", expression: "1 +" },
        { id: "f-c", name: "C", type: "formula", expression: "" },
      ],
    });
    expect(changedFormulaExpressions(database).size).toBe(0);
  });
});

describe("migrateFormulaExpressionsToIdRefs", () => {
  it("writes only the changed formula fields", () => {
    const write = vi.fn();
    migrateFormulaExpressionsToIdRefs([NAME_REF_DATABASE], write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      "db-1",
      "f-total",
      'prop("f-price") * 2'
    );
  });

  it("is a no-op on a second run over the migrated schema", () => {
    const migrated = makeDatabase({
      fields: NAME_REF_DATABASE.fields.map((field) =>
        field.id === "f-total"
          ? { ...field, expression: 'prop("f-price") * 2' }
          : field
      ),
    });
    const write = vi.fn();
    migrateFormulaExpressionsToIdRefs([migrated], write);
    expect(write).not.toHaveBeenCalled();
  });

  it("does nothing when no databases exist", () => {
    const write = vi.fn();
    migrateFormulaExpressionsToIdRefs([], write);
    expect(write).not.toHaveBeenCalled();
  });
});
