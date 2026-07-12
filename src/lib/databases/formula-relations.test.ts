import { beforeEach, describe, expect, it, vi } from "vitest";

import { localFormulaRelationResolver } from "@/lib/databases/formula-relations.ts";
import {
  computeFormulaOverlay,
  computeFormulaRowValues,
} from "@/lib/databases/formula-values.ts";
import { isFormulaError } from "@/lib/formula/values.ts";
import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * The resolver reads the local collections synchronously, so the tests mock
 * the collections module with plain in-memory arrays (same pattern as
 * `db/queries/database-collection-ops.test.ts`).
 */
const store = vi.hoisted(() => ({
  databases: [] as LocalDatabase[],
  rows: [] as LocalDatabaseRow[],
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabasesCollection: {
    get: (id: string) => store.databases.find((database) => database.id === id),
  },
  localDatabaseRowsCollection: {
    get toArray() {
      return store.rows;
    },
  },
}));

function database(
  id: string,
  name: string,
  primaryFieldId: string,
  fields: DatabaseField[]
): LocalDatabase {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    fields,
    id,
    name,
    primaryFieldId,
    updatedAt: "2026-01-01T00:00:00.000Z",
    views: [],
  };
}

function dbRow(
  id: string,
  databaseId: string,
  values: LocalDatabaseRow["values"]
): LocalDatabaseRow {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    databaseId,
    id,
    updatedAt: "2026-01-01T00:00:00.000Z",
    values,
  };
}

/** Projects (db-a) relate to Tasks (db-b); Tasks carry a local formula. */
function seedAcyclic(): void {
  store.databases = [
    database("db-a", "Projects", "a-name", [
      { id: "a-name", name: "Name", type: "text" },
      {
        id: "a-rel",
        name: "Tasks",
        targetDatabaseId: "db-b",
        type: "relation",
      },
      {
        expression: 'prop("a-rel").map(r => r.Double).sum()',
        id: "a-roll",
        name: "Rollup",
        type: "formula",
      },
    ]),
    database("db-b", "Tasks", "b-name", [
      { id: "b-name", name: "Name", type: "text" },
      { id: "b-est", name: "Estimate", type: "number" },
      {
        expression: 'prop("b-est") * 2',
        id: "b-double",
        name: "Double",
        type: "formula",
      },
    ]),
  ];
  store.rows = [
    dbRow("p1", "db-a", { "a-name": "Site", "a-rel": ["t1", "t2"] }),
    dbRow("t1", "db-b", { "b-est": 3, "b-name": "Design" }),
    dbRow("t2", "db-b", { "b-est": 4, "b-name": "Build" }),
  ];
}

/** Mutually recursive cross-database formulas: A.Rollup ⇄ B.Calc. */
function seedCyclic(): void {
  store.databases = [
    database("db-a", "Projects", "a-name", [
      { id: "a-name", name: "Name", type: "text" },
      {
        id: "a-rel",
        name: "Tasks",
        targetDatabaseId: "db-b",
        type: "relation",
      },
      {
        expression: 'prop("a-rel").map(r => r.Calc).sum()',
        id: "a-roll",
        name: "Rollup",
        type: "formula",
      },
    ]),
    database("db-b", "Tasks", "b-name", [
      { id: "b-name", name: "Name", type: "text" },
      {
        id: "b-rel",
        name: "Project",
        targetDatabaseId: "db-a",
        type: "relation",
      },
      {
        expression: 'prop("b-rel").map(p => p.Rollup).sum()',
        id: "b-calc",
        name: "Calc",
        type: "formula",
      },
    ]),
  ];
  store.rows = [
    dbRow("p1", "db-a", { "a-name": "Site", "a-rel": ["t1"] }),
    dbRow("t1", "db-b", { "b-name": "Design", "b-rel": ["p1"] }),
  ];
}

beforeEach(() => {
  seedAcyclic();
});

describe("localFormulaRelationResolver", () => {
  it("resolves target databases and rows from the collections", () => {
    const resolver = localFormulaRelationResolver();
    const target = resolver.database("db-b");
    expect(target?.name).toBe("Tasks");
    expect(target?.primaryFieldId).toBe("b-name");
    expect(target?.row("t1")).toEqual({ "b-est": 3, "b-name": "Design" });
    expect(target?.row("ghost")).toBeNull();
    expect(resolver.database("db-nope")).toBeNull();
  });

  it("computes formula members through the target's own plan", () => {
    const resolver = localFormulaRelationResolver();
    expect(resolver.formulaValue?.("db-b", "t1", "b-double")).toBe(6);
    // Stale rows and unknown databases read as blank, never throw.
    expect(resolver.formulaValue?.("db-b", "ghost", "b-double")).toBeNull();
    expect(resolver.formulaValue?.("db-nope", "t1", "b-double")).toBeNull();
  });

  it("names cross-database formula cycles instead of recursing", () => {
    seedCyclic();
    const resolver = localFormulaRelationResolver();
    const value = resolver.formulaValue?.("db-b", "t1", "b-calc");
    if (value === undefined || value === null || !isFormulaError(value)) {
      throw new Error(`expected a cycle error, got ${JSON.stringify(value)}`);
    }
    expect(value.message).toBe(
      "Circular reference: Tasks.Calc → Projects.Rollup → Tasks.Calc"
    );
  });
});

describe("relation rollups over the collections", () => {
  it("computes the grid overlay's rollup column end-to-end", () => {
    const projects = store.databases[0];
    const projectRows = store.rows.filter((row) => row.databaseId === "db-a");
    const overlay = computeFormulaOverlay(projects.fields, projectRows, {
      relations: localFormulaRelationResolver(),
    });
    // t1: 3 * 2 + t2: 4 * 2 — target FORMULA members included.
    expect(overlay.get("p1")?.["a-roll"]).toEqual({
      cellValue: 14,
      display: "14",
      isError: false,
    });
  });

  it("computes the panel preview path (computeFormulaRowValues) identically", () => {
    const projects = store.databases[0];
    const resolved = computeFormulaRowValues(
      projects.fields,
      { "a-name": "Site", "a-rel": ["t1"] },
      { relations: localFormulaRelationResolver() }
    );
    expect(resolved.get("a-roll")).toBe(6);
  });

  it("degrades cross-database cycles to per-cell errors in the overlay", () => {
    seedCyclic();
    const projects = store.databases[0];
    const projectRows = store.rows.filter((row) => row.databaseId === "db-a");
    const overlay = computeFormulaOverlay(projects.fields, projectRows, {
      relations: localFormulaRelationResolver(),
    });
    const cell = overlay.get("p1")?.["a-roll"];
    expect(cell?.isError).toBe(true);
    expect(cell?.display).toBe(
      "⚠ Circular reference: Tasks.Calc → Projects.Rollup → Tasks.Calc"
    );
  });
});
