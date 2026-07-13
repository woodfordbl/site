import { describe, expect, it } from "vitest";

import {
  addFormulaDirtyRows,
  FORMULA_ALL_ROWS,
  type FormulaDirtyMap,
  formulaClockTick,
  formulaDataCellChanged,
  formulaRelationCellChanged,
  formulaRowAdded,
  formulaRowRemoved,
  formulaSchemaChanged,
} from "@/lib/formula-engine/dirty.ts";
import {
  buildFormulaGraph,
  type FormulaGraphDatabase,
} from "@/lib/formula-engine/graph.ts";
import {
  buildFormulaReverseIndexes,
  formulaReferrersOf,
} from "@/lib/formula-engine/reverse-index.ts";
import type {
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

function textField(id: string, name: string): DatabaseField {
  return { id, name, type: "text" };
}

function numberField(id: string, name: string): DatabaseField {
  return { id, name, type: "number" };
}

function formulaField(
  id: string,
  name: string,
  expression: string
): DatabaseField {
  return { expression, id, name, type: "formula" };
}

function relationField(
  id: string,
  name: string,
  targetDatabaseId: string
): DatabaseField {
  return { id, name, targetDatabaseId, type: "relation" };
}

function rowOf(
  databaseId: string,
  id: string,
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

// Three-hop chain A→B→C. A's columns cover every mapping shape: same-row
// data (`a-local`), one-hop member traversals with distinct members
// (`a-roll` on Estimate, `a-first` on Name), a chained two-hop traversal
// (`a-deep` into C), and a volatile clock formula (`a-vol`).
const DATABASES = new Map<string, FormulaGraphDatabase>([
  [
    "db-a",
    {
      fields: [
        numberField("a-price", "Price"),
        relationField("a-rel", "Tasks", "db-b"),
        formulaField("a-local", "Local", 'prop("a-price") * 2'),
        formulaField(
          "a-roll",
          "Roll",
          'prop("a-rel").map(r => r.Estimate).sum()'
        ),
        formulaField("a-first", "First", 'prop("a-rel").first().Name'),
        formulaField(
          "a-deep",
          "Deep",
          'prop("a-rel").map(b => b.Steps.map(c => c.Hours).sum()).sum()'
        ),
        formulaField("a-vol", "Vol", "today()"),
      ],
      name: "Projects",
    },
  ],
  [
    "db-b",
    {
      fields: [
        textField("b-name", "Name"),
        numberField("b-est", "Estimate"),
        relationField("b-rel-c", "Steps", "db-c"),
        formulaField("b-double", "Double", 'prop("b-est") * 2'),
      ],
      name: "Tasks",
    },
  ],
  ["db-c", { fields: [numberField("c-hours", "Hours")], name: "Steps" }],
]);

const ROWS_BY_DB = new Map<string, readonly LocalDatabaseRow[]>([
  [
    "db-a",
    [
      rowOf("db-a", "a1", { "a-rel": ["b1"] }),
      rowOf("db-a", "a2", { "a-rel": ["b1", "b2", "b-stale"] }),
      rowOf("db-a", "a3", {}),
    ],
  ],
  [
    "db-b",
    [
      rowOf("db-b", "b1", { "b-est": 3, "b-rel-c": ["c1"] }),
      rowOf("db-b", "b2", { "b-est": 4, "b-rel-c": ["c2"] }),
    ],
  ],
]);

function setup() {
  const graph = buildFormulaGraph(DATABASES);
  const indexes = buildFormulaReverseIndexes(graph, (databaseId) =>
    ROWS_BY_DB.get(databaseId)
  );
  const dirty: FormulaDirtyMap = new Map();
  return { dirty, graph, indexes };
}

describe("addFormulaDirtyRows", () => {
  it("accumulates row sets and lets the all-rows sentinel absorb them", () => {
    const dirty: FormulaDirtyMap = new Map();
    addFormulaDirtyRows(dirty, "k", ["r1"]);
    addFormulaDirtyRows(dirty, "k", ["r2"]);
    expect(dirty.get("k")).toEqual(new Set(["r1", "r2"]));

    addFormulaDirtyRows(dirty, "k", FORMULA_ALL_ROWS);
    expect(dirty.get("k")).toBe(FORMULA_ALL_ROWS);
    // Row-level marks after "all" are absorbed.
    addFormulaDirtyRows(dirty, "k", ["r3"]);
    expect(dirty.get("k")).toBe(FORMULA_ALL_ROWS);
  });

  it("does not record entries for empty row sets", () => {
    const dirty: FormulaDirtyMap = new Map();
    addFormulaDirtyRows(dirty, "k", []);
    expect(dirty.size).toBe(0);
  });
});

describe("formulaDataCellChanged", () => {
  it("dirties same-database columns referencing the field, same row only", () => {
    const { dirty, graph, indexes } = setup();
    formulaDataCellChanged(graph, indexes, dirty, {
      databaseId: "db-a",
      fieldId: "a-price",
      rowId: "a1",
    });
    expect(dirty.get("db-a:a-local")).toEqual(new Set(["a1"]));
    expect([...dirty.keys()]).toEqual(["db-a:a-local"]);
  });

  it("dirties referrer rows via the reverse index, member-precise", () => {
    const { dirty, graph, indexes } = setup();
    formulaDataCellChanged(graph, indexes, dirty, {
      databaseId: "db-b",
      fieldId: "b-est",
      rowId: "b1",
    });
    // Same-database dependent in B, plus A's Estimate rollup for b1's
    // referrers; the Name traversal and the C-member chain stay clean.
    expect(dirty.get("db-b:b-double")).toEqual(new Set(["b1"]));
    expect(dirty.get("db-a:a-roll")).toEqual(new Set(["a1", "a2"]));
    expect(dirty.has("db-a:a-first")).toBe(false);
    expect(dirty.has("db-a:a-deep")).toBe(false);
    expect(dirty.has("db-a:a-local")).toBe(false);
  });

  it("maps chained hops back through composed reverse indexes (C→B→A)", () => {
    const { dirty, graph, indexes } = setup();
    formulaDataCellChanged(graph, indexes, dirty, {
      databaseId: "db-c",
      fieldId: "c-hours",
      rowId: "c1",
    });
    // c1 ← b1 (b-rel-c) ← {a1, a2} (a-rel).
    expect(dirty.get("db-a:a-deep")).toEqual(new Set(["a1", "a2"]));
    expect([...dirty.keys()]).toEqual(["db-a:a-deep"]);

    const narrower: FormulaDirtyMap = new Map();
    formulaDataCellChanged(graph, indexes, narrower, {
      databaseId: "db-c",
      fieldId: "c-hours",
      rowId: "c2",
    });
    // c2 ← b2 ← a2 only.
    expect(narrower.get("db-a:a-deep")).toEqual(new Set(["a2"]));
  });
});

describe("formulaRelationCellChanged", () => {
  it("updates the reverse index first, then dirties the editing row", () => {
    const { dirty, graph, indexes } = setup();
    formulaRelationCellChanged(graph, indexes, dirty, {
      databaseId: "db-a",
      fieldId: "a-rel",
      newTargetIds: ["b2"],
      oldTargetIds: ["b1"],
      rowId: "a1",
    });
    expect(formulaReferrersOf(indexes, "a-rel", "b1")).toEqual(new Set(["a2"]));
    expect(formulaReferrersOf(indexes, "a-rel", "b2")).toEqual(
      new Set(["a1", "a2"])
    );
    // Every A column reading the relation field dirties the edited row.
    expect(dirty.get("db-a:a-roll")).toEqual(new Set(["a1"]));
    expect(dirty.get("db-a:a-first")).toEqual(new Set(["a1"]));
    expect(dirty.get("db-a:a-deep")).toEqual(new Set(["a1"]));
    expect(dirty.has("db-a:a-local")).toBe(false);
  });

  it("dirties upstream chained columns when a mid-chain relation changes", () => {
    const { dirty, graph, indexes } = setup();
    formulaRelationCellChanged(graph, indexes, dirty, {
      databaseId: "db-b",
      fieldId: "b-rel-c",
      newTargetIds: [],
      oldTargetIds: ["c1"],
      rowId: "b1",
    });
    expect(formulaReferrersOf(indexes, "b-rel-c", "c1")).toEqual(new Set());
    // Only the chain whose first-hop member is `b-rel-c` reacts; B has no
    // column reading its own relation field.
    expect(dirty.get("db-a:a-deep")).toEqual(new Set(["a1", "a2"]));
    expect([...dirty.keys()]).toEqual(["db-a:a-deep"]);
  });
});

describe("formulaRowAdded / formulaRowRemoved", () => {
  it("dirties every column of the new row's database and indexes its links", () => {
    const { dirty, graph, indexes } = setup();
    formulaRowAdded(graph, indexes, dirty, {
      databaseId: "db-b",
      rowId: "b3",
      values: { "b-est": 9, "b-rel-c": ["c1"] },
    });
    expect(dirty.get("db-b:b-double")).toEqual(new Set(["b3"]));
    expect(formulaReferrersOf(indexes, "b-rel-c", "c1")).toEqual(
      new Set(["b1", "b3"])
    );
    // Nothing references b3 yet — no referrer columns dirty.
    expect(dirty.has("db-a:a-roll")).toBe(false);
  });

  it("dirties referrers holding a stale id when that row appears (heal)", () => {
    const { dirty, graph, indexes } = setup();
    formulaRowAdded(graph, indexes, dirty, {
      databaseId: "db-b",
      rowId: "b-stale",
      values: {},
    });
    // a2 stored "b-stale" all along — its refs un-skip now.
    expect(dirty.get("db-a:a-roll")).toEqual(new Set(["a2"]));
    expect(dirty.get("db-a:a-first")).toEqual(new Set(["a2"]));
    expect(dirty.get("db-a:a-deep")).toEqual(new Set(["a2"]));
    expect(dirty.get("db-b:b-double")).toEqual(new Set(["b-stale"]));
  });

  it("dirties referrers of a removed row and drops only its outgoing links", () => {
    const { dirty, graph, indexes } = setup();
    formulaRowRemoved(graph, indexes, dirty, {
      databaseId: "db-b",
      rowId: "b2",
      values: { "b-est": 4, "b-rel-c": ["c2"] },
    });
    expect(dirty.get("db-a:a-roll")).toEqual(new Set(["a2"]));
    expect(dirty.get("db-a:a-first")).toEqual(new Set(["a2"]));
    expect(dirty.get("db-a:a-deep")).toEqual(new Set(["a2"]));
    // The removed row's own cells are evicted by the caller, not dirtied.
    expect(dirty.has("db-b:b-double")).toBe(false);
    // Outgoing links leave the index…
    expect(formulaReferrersOf(indexes, "b-rel-c", "c2")).toEqual(new Set());
    // …but entries where b2 is a TARGET stay (stored cells still hold it).
    expect(formulaReferrersOf(indexes, "a-rel", "b2")).toEqual(new Set(["a2"]));
  });
});

describe("db() whole-database references — coarse dirtying", () => {
  // A reads B whole (db refs, member-precise), including a chained hop:
  // `a-deep` goes db("db-b") → relation b-rel-c → C.
  const DB_REF_DATABASES = new Map<string, FormulaGraphDatabase>([
    [
      "db-a",
      {
        fields: [
          numberField("a-price", "Price"),
          formulaField(
            "a-total",
            "Total",
            'db("db-b").map(r => r.Estimate).sum()'
          ),
          formulaField("a-names", "Names", 'db("db-b").first().Name'),
          formulaField(
            "a-deep",
            "Deep",
            'db("db-b").map(b => b.Steps.map(c => c.Hours).sum()).sum()'
          ),
        ],
        name: "Projects",
      },
    ],
    [
      "db-b",
      {
        fields: [
          textField("b-name", "Name"),
          numberField("b-est", "Estimate"),
          relationField("b-rel-c", "Steps", "db-c"),
        ],
        name: "Tasks",
      },
    ],
    ["db-c", { fields: [numberField("c-hours", "Hours")], name: "Steps" }],
  ]);

  const DB_REF_ROWS = new Map<string, readonly LocalDatabaseRow[]>([
    ["db-a", [rowOf("db-a", "a1", {}), rowOf("db-a", "a2", {})]],
    [
      "db-b",
      [
        rowOf("db-b", "b1", { "b-est": 3, "b-rel-c": ["c1"] }),
        rowOf("db-b", "b2", { "b-est": 4 }),
      ],
    ],
  ]);

  function setupDbRefs() {
    const graph = buildFormulaGraph(DB_REF_DATABASES);
    const indexes = buildFormulaReverseIndexes(graph, (databaseId) =>
      DB_REF_ROWS.get(databaseId)
    );
    const dirty: FormulaDirtyMap = new Map();
    return { dirty, graph, indexes };
  }

  it("dirties every row of the referencing column on a target data edit", () => {
    const { dirty, graph, indexes } = setupDbRefs();
    formulaDataCellChanged(graph, indexes, dirty, {
      databaseId: "db-b",
      fieldId: "b-est",
      rowId: "b1",
    });
    expect(dirty.get("db-a:a-total")).toBe(FORMULA_ALL_ROWS);
    // Member precision holds: the Name reader ignores an Estimate edit.
    expect(dirty.has("db-a:a-names")).toBe(false);
  });

  it("dirties referencing columns on target row add AND remove", () => {
    const added = setupDbRefs();
    formulaRowAdded(added.graph, added.indexes, added.dirty, {
      databaseId: "db-b",
      rowId: "b3",
      values: { "b-est": 9 },
    });
    expect(added.dirty.get("db-a:a-total")).toBe(FORMULA_ALL_ROWS);
    expect(added.dirty.get("db-a:a-names")).toBe(FORMULA_ALL_ROWS);

    const removed = setupDbRefs();
    formulaRowRemoved(removed.graph, removed.indexes, removed.dirty, {
      databaseId: "db-b",
      rowId: "b2",
      values: { "b-est": 4 },
    });
    expect(removed.dirty.get("db-a:a-total")).toBe(FORMULA_ALL_ROWS);
    expect(removed.dirty.get("db-a:a-names")).toBe(FORMULA_ALL_ROWS);
  });

  it("does not react to changes in unreferenced databases", () => {
    const { dirty, graph, indexes } = setupDbRefs();
    formulaDataCellChanged(graph, indexes, dirty, {
      databaseId: "db-a",
      fieldId: "a-price",
      rowId: "a1",
    });
    expect(dirty.size).toBe(0);
  });

  it("coarsens a chained relation hop that crosses the db() reference", () => {
    const { dirty, graph, indexes } = setupDbRefs();
    formulaDataCellChanged(graph, indexes, dirty, {
      databaseId: "db-c",
      fieldId: "c-hours",
      rowId: "c1",
    });
    // c1 ← b1 through the b-rel-c reverse index, then B → A has no relation
    // hop (B is read whole) — the entire deep column dirties.
    expect(dirty.get("db-a:a-deep")).toBe(FORMULA_ALL_ROWS);
    expect([...dirty.keys()]).toEqual(["db-a:a-deep"]);
  });

  it("marks db-referencing columns all-rows on a target schema change", () => {
    const { dirty, graph } = setupDbRefs();
    formulaSchemaChanged(graph, dirty, "db-b");
    expect(dirty.get("db-a:a-total")).toBe(FORMULA_ALL_ROWS);
    expect(dirty.get("db-a:a-names")).toBe(FORMULA_ALL_ROWS);
    expect(dirty.get("db-a:a-deep")).toBe(FORMULA_ALL_ROWS);
  });
});

describe("formulaSchemaChanged / formulaClockTick", () => {
  it("marks the changed database's columns and inbound traversers all-rows", () => {
    const { dirty, graph } = setup();
    formulaSchemaChanged(graph, dirty, "db-b");
    expect(dirty.get("db-b:b-double")).toBe(FORMULA_ALL_ROWS);
    expect(dirty.get("db-a:a-roll")).toBe(FORMULA_ALL_ROWS);
    expect(dirty.get("db-a:a-first")).toBe(FORMULA_ALL_ROWS);
    expect(dirty.get("db-a:a-deep")).toBe(FORMULA_ALL_ROWS);
    // Columns not touching db-b stay clean.
    expect(dirty.has("db-a:a-local")).toBe(false);
    expect(dirty.has("db-a:a-vol")).toBe(false);
  });

  it("marks only volatile columns on a clock tick", () => {
    const { dirty, graph } = setup();
    formulaClockTick(graph, dirty);
    expect(dirty.get("db-a:a-vol")).toBe(FORMULA_ALL_ROWS);
    expect(dirty.size).toBe(1);
  });
});
