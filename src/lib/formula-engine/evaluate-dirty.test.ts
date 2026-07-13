import { describe, expect, it } from "vitest";
import type { FormulaRelationResolver } from "@/lib/formula/values.ts";
import { isFormulaError } from "@/lib/formula/values.ts";
import {
  addFormulaDirtyRows,
  FORMULA_ALL_ROWS,
  type FormulaDirtyMap,
  formulaClockTick,
  formulaDataCellChanged,
} from "@/lib/formula-engine/dirty.ts";
import {
  evaluateDirtyFormulas,
  type FormulaValueCache,
  formulaRowsSnapshotOf,
} from "@/lib/formula-engine/evaluate-dirty.ts";
import {
  buildFormulaGraph,
  type FormulaGraph,
  type FormulaGraphDatabase,
} from "@/lib/formula-engine/graph.ts";
import {
  buildFormulaReverseIndexes,
  type FormulaReverseIndexes,
} from "@/lib/formula-engine/reverse-index.ts";
import type {
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

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

type RowsByDb = ReadonlyMap<string, readonly LocalDatabaseRow[]>;

/** Every column marked all-rows — the full-recompute pass. */
function dirtyAll(graph: FormulaGraph): FormulaDirtyMap {
  const dirty: FormulaDirtyMap = new Map();
  for (const key of graph.columns.keys()) {
    addFormulaDirtyRows(dirty, key, FORMULA_ALL_ROWS);
  }
  return dirty;
}

/**
 * A resolver over plain rows, formula members reading the engine's own value
 * cache — the P3.3b wiring the stateful shell will provide.
 */
function resolverOf(
  databases: ReadonlyMap<string, FormulaGraphDatabase>,
  rowsByDb: RowsByDb,
  cache: FormulaValueCache
): FormulaRelationResolver {
  return {
    database: (databaseId) => {
      const database = databases.get(databaseId);
      if (database === undefined) {
        return null;
      }
      const rows = rowsByDb.get(databaseId) ?? [];
      return {
        fields: database.fields,
        name: database.name,
        primaryFieldId: database.fields[0].id,
        row: (rowId) => rows.find((row) => row.id === rowId)?.values ?? null,
      };
    },
    formulaValue: (databaseId, rowId, fieldId) =>
      cache.get(databaseId)?.get(rowId)?.get(fieldId)?.value ?? null,
  };
}

/** Evaluation-count instrumentation via the `onEvaluate` hook. */
function counterOf() {
  const events: string[] = [];
  return {
    events,
    onEvaluate: (databaseId: string, fieldId: string, rowId: string) => {
      events.push(`${databaseId}:${fieldId}:${rowId}`);
    },
  };
}

function cellOf(
  cache: FormulaValueCache,
  databaseId: string,
  rowId: string,
  fieldId: string
) {
  return cache.get(databaseId)?.get(rowId)?.get(fieldId);
}

describe("evaluateDirtyFormulas — full pass and cache contents", () => {
  const databases = new Map<string, FormulaGraphDatabase>([
    [
      "db",
      {
        fields: [
          numberField("f-price", "Price"),
          formulaField("f-one", "One", 'prop("f-price") * 2'),
          formulaField("f-two", "Two", 'prop("f-one") + 1'),
        ],
        name: "Db",
      },
    ],
  ]);

  it("evaluates every dirty cell in topo order into the cache", () => {
    const graph = buildFormulaGraph(databases);
    const rows = [
      rowOf("db", "r1", { "f-price": 10 }),
      rowOf("db", "r2", { "f-price": 4 }),
    ];
    const cache: FormulaValueCache = new Map();
    const counter = counterOf();
    const dirty = dirtyAll(graph);
    evaluateDirtyFormulas(
      graph,
      dirty,
      cache,
      formulaRowsSnapshotOf(new Map([["db", rows]])),
      new Map(),
      { onEvaluate: counter.onEvaluate }
    );

    expect(counter.events).toHaveLength(4);
    expect(cellOf(cache, "db", "r1", "f-one")).toEqual({
      result: { cellValue: 20, display: "20", isError: false },
      value: 20,
    });
    expect(cellOf(cache, "db", "r1", "f-two")?.value).toBe(21);
    expect(cellOf(cache, "db", "r2", "f-one")?.value).toBe(8);
    expect(cellOf(cache, "db", "r2", "f-two")?.value).toBe(9);
    // The dirty map is consumed.
    expect(dirty.size).toBe(0);
  });

  it("evicts cached cells for dirty rows missing from the snapshot", () => {
    const graph = buildFormulaGraph(databases);
    const rows = [
      rowOf("db", "r1", { "f-price": 10 }),
      rowOf("db", "r2", { "f-price": 4 }),
    ];
    const cache: FormulaValueCache = new Map();
    evaluateDirtyFormulas(
      graph,
      dirtyAll(graph),
      cache,
      formulaRowsSnapshotOf(new Map([["db", rows]])),
      new Map()
    );
    expect(cache.get("db")?.has("r2")).toBe(true);

    // r2 disappears; a dirty mark against it evicts instead of evaluating.
    const counter = counterOf();
    const dirty: FormulaDirtyMap = new Map();
    addFormulaDirtyRows(dirty, "db:f-one", ["r2"]);
    addFormulaDirtyRows(dirty, "db:f-two", ["r2"]);
    evaluateDirtyFormulas(
      graph,
      dirty,
      cache,
      formulaRowsSnapshotOf(new Map([["db", [rows[0]]]])),
      new Map(),
      { onEvaluate: counter.onEvaluate }
    );
    expect(counter.events).toHaveLength(0);
    expect(cache.get("db")?.has("r2")).toBe(false);
    expect(cellOf(cache, "db", "r1", "f-two")?.value).toBe(21);
  });
});

describe("evaluateDirtyFormulas — equality cutoff", () => {
  const databases = new Map<string, FormulaGraphDatabase>([
    [
      "db",
      {
        fields: [
          numberField("f-price", "Price"),
          formulaField("f-floor", "Floor", 'floor(prop("f-price") / 10)'),
          formulaField("f-dep", "Dep", 'prop("f-floor") + 1'),
        ],
        name: "Db",
      },
    ],
  ]);

  function fullPass(graph: FormulaGraph, rows: readonly LocalDatabaseRow[]) {
    const cache: FormulaValueCache = new Map();
    evaluateDirtyFormulas(
      graph,
      dirtyAll(graph),
      cache,
      formulaRowsSnapshotOf(new Map([["db", rows]])),
      new Map()
    );
    return cache;
  }

  it("does not re-evaluate dependents when the edit leaves the value equal", () => {
    const graph = buildFormulaGraph(databases);
    const cache = fullPass(graph, [rowOf("db", "r1", { "f-price": 11 })]);
    expect(cellOf(cache, "db", "r1", "f-floor")?.value).toBe(1);
    expect(cellOf(cache, "db", "r1", "f-dep")?.value).toBe(2);

    // 11 → 12: floor(12/10) is still 1 — the cascade stops cold.
    const edited = [rowOf("db", "r1", { "f-price": 12 })];
    const counter = counterOf();
    const dirty: FormulaDirtyMap = new Map();
    formulaDataCellChanged(graph, new Map(), dirty, {
      databaseId: "db",
      fieldId: "f-price",
      rowId: "r1",
    });
    expect([...dirty.keys()]).toEqual(["db:f-floor"]);
    evaluateDirtyFormulas(
      graph,
      dirty,
      cache,
      formulaRowsSnapshotOf(new Map([["db", edited]])),
      new Map(),
      { onEvaluate: counter.onEvaluate }
    );
    expect(counter.events).toEqual(["db:f-floor:r1"]);
    expect(cellOf(cache, "db", "r1", "f-dep")?.value).toBe(2);
  });

  it("propagates one level and stops where the next level is equal", () => {
    const graph = buildFormulaGraph(
      new Map<string, FormulaGraphDatabase>([
        [
          "db",
          {
            fields: [
              numberField("f-price", "Price"),
              formulaField("f-a", "A", 'prop("f-price") * 2'),
              formulaField("f-b", "B", 'if(prop("f-a") > 10, "big", "small")'),
              formulaField("f-c", "C", 'concat(prop("f-b"), "!")'),
            ],
            name: "Db",
          },
        ],
      ])
    );
    const cache: FormulaValueCache = new Map();
    evaluateDirtyFormulas(
      graph,
      dirtyAll(graph),
      cache,
      formulaRowsSnapshotOf(
        new Map([["db", [rowOf("db", "r1", { "f-price": 10 })]]])
      ),
      new Map()
    );
    expect(cellOf(cache, "db", "r1", "f-b")?.value).toBe("big");
    expect(cellOf(cache, "db", "r1", "f-c")?.value).toBe("big!");

    // 10 → 20: A changes (20 → 40), B re-evaluates to the same "big", C is
    // never touched.
    const counter = counterOf();
    const dirty: FormulaDirtyMap = new Map();
    formulaDataCellChanged(graph, new Map(), dirty, {
      databaseId: "db",
      fieldId: "f-price",
      rowId: "r1",
    });
    evaluateDirtyFormulas(
      graph,
      dirty,
      cache,
      formulaRowsSnapshotOf(
        new Map([["db", [rowOf("db", "r1", { "f-price": 20 })]]])
      ),
      new Map(),
      { onEvaluate: counter.onEvaluate }
    );
    expect(counter.events).toEqual(["db:f-a:r1", "db:f-b:r1"]);
    expect(cellOf(cache, "db", "r1", "f-a")?.value).toBe(40);
    expect(cellOf(cache, "db", "r1", "f-c")?.value).toBe("big!");
  });
});

describe("evaluateDirtyFormulas — relation rollups", () => {
  const databases = new Map<string, FormulaGraphDatabase>([
    [
      "db-a",
      {
        fields: [
          relationField("a-rel", "Tasks", "db-b"),
          formulaField(
            "a-sum",
            "Sum",
            'prop("a-rel").map(r => r.Estimate).sum()'
          ),
        ],
        name: "Projects",
      },
    ],
    [
      "db-b",
      {
        fields: [numberField("b-est", "Estimate")],
        name: "Tasks",
      },
    ],
  ]);

  it("re-evaluates the rollup when a target data cell changes", () => {
    const graph = buildFormulaGraph(databases);
    const rowsA = [rowOf("db-a", "a1", { "a-rel": ["b1", "b2"] })];
    const rowsB = [
      rowOf("db-b", "b1", { "b-est": 3 }),
      rowOf("db-b", "b2", { "b-est": 4 }),
    ];
    const rowsByDb: RowsByDb = new Map([
      ["db-a", rowsA],
      ["db-b", rowsB],
    ]);
    const indexes = buildFormulaReverseIndexes(graph, (databaseId) =>
      rowsByDb.get(databaseId)
    );
    const cache: FormulaValueCache = new Map();
    evaluateDirtyFormulas(
      graph,
      dirtyAll(graph),
      cache,
      formulaRowsSnapshotOf(rowsByDb),
      indexes,
      { relations: resolverOf(databases, rowsByDb, cache) }
    );
    expect(cellOf(cache, "db-a", "a1", "a-sum")?.value).toBe(7);

    // b1's Estimate 3 → 5: the reverse index maps the target row to a1.
    const editedB = [rowOf("db-b", "b1", { "b-est": 5 }), rowsB[1]];
    const editedRows: RowsByDb = new Map([
      ["db-a", rowsA],
      ["db-b", editedB],
    ]);
    const counter = counterOf();
    const dirty: FormulaDirtyMap = new Map();
    formulaDataCellChanged(graph, indexes, dirty, {
      databaseId: "db-b",
      fieldId: "b-est",
      rowId: "b1",
    });
    expect(dirty.get("db-a:a-sum")).toEqual(new Set(["a1"]));
    evaluateDirtyFormulas(
      graph,
      dirty,
      cache,
      formulaRowsSnapshotOf(editedRows),
      indexes,
      {
        onEvaluate: counter.onEvaluate,
        relations: resolverOf(databases, editedRows, cache),
      }
    );
    expect(counter.events).toEqual(["db-a:a-sum:a1"]);
    expect(cellOf(cache, "db-a", "a1", "a-sum")?.value).toBe(9);
  });

  it("propagates cross-database formula members through viaRelation edges with cutoff", () => {
    // B.Clamp = max(Estimate, 10); A sums Clamp over its tasks. A data edit
    // in B dirties ONLY B.Clamp (member precision) — A re-evaluates solely
    // when Clamp's value actually changes.
    const memberDatabases = new Map<string, FormulaGraphDatabase>([
      [
        "db-a",
        {
          fields: [
            relationField("a-rel", "Tasks", "db-b"),
            formulaField(
              "a-sum",
              "Sum",
              'prop("a-rel").map(r => r.Clamp).sum()'
            ),
          ],
          name: "Projects",
        },
      ],
      [
        "db-b",
        {
          fields: [
            numberField("b-est", "Estimate"),
            formulaField(
              "b-clamp",
              "Clamp",
              'if(prop("b-est") > 10, prop("b-est"), 10)'
            ),
          ],
          name: "Tasks",
        },
      ],
    ]);
    const graph = buildFormulaGraph(memberDatabases);
    const rowsA = [rowOf("db-a", "a1", { "a-rel": ["b1", "b2"] })];
    const rowsOfB = (est1: number) => [
      rowOf("db-b", "b1", { "b-est": est1 }),
      rowOf("db-b", "b2", { "b-est": 4 }),
    ];
    const rowsFor = (est1: number): RowsByDb =>
      new Map([
        ["db-a", rowsA],
        ["db-b", rowsOfB(est1)],
      ]);
    const indexes: FormulaReverseIndexes = buildFormulaReverseIndexes(
      graph,
      (databaseId) => rowsFor(3).get(databaseId)
    );
    const cache: FormulaValueCache = new Map();
    const passOn = (rowsByDb: RowsByDb, dirty: FormulaDirtyMap) => {
      const counter = counterOf();
      evaluateDirtyFormulas(
        graph,
        dirty,
        cache,
        formulaRowsSnapshotOf(rowsByDb),
        indexes,
        {
          onEvaluate: counter.onEvaluate,
          relations: resolverOf(memberDatabases, rowsByDb, cache),
        }
      );
      return counter.events;
    };

    passOn(rowsFor(3), dirtyAll(graph));
    expect(cellOf(cache, "db-b", "b1", "b-clamp")?.value).toBe(10);
    expect(cellOf(cache, "db-a", "a1", "a-sum")?.value).toBe(20);

    // 3 → 5: Clamp stays 10 — the viaRelation dependent never re-evaluates.
    const cutoffDirty: FormulaDirtyMap = new Map();
    formulaDataCellChanged(graph, indexes, cutoffDirty, {
      databaseId: "db-b",
      fieldId: "b-est",
      rowId: "b1",
    });
    expect([...cutoffDirty.keys()]).toEqual(["db-b:b-clamp"]);
    expect(passOn(rowsFor(5), cutoffDirty)).toEqual(["db-b:b-clamp:b1"]);
    expect(cellOf(cache, "db-a", "a1", "a-sum")?.value).toBe(20);

    // 5 → 12: Clamp changes to 12 — the change maps to a1 and propagates.
    const changeDirty: FormulaDirtyMap = new Map();
    formulaDataCellChanged(graph, indexes, changeDirty, {
      databaseId: "db-b",
      fieldId: "b-est",
      rowId: "b1",
    });
    expect(passOn(rowsFor(12), changeDirty)).toEqual([
      "db-b:b-clamp:b1",
      "db-a:a-sum:a1",
    ]);
    expect(cellOf(cache, "db-a", "a1", "a-sum")?.value).toBe(22);
  });
});

describe("evaluateDirtyFormulas — cycles and volatility", () => {
  it("seeds cycle errors without evaluating and propagates them to dependents", () => {
    const graph = buildFormulaGraph(
      new Map<string, FormulaGraphDatabase>([
        [
          "db",
          {
            fields: [
              formulaField("f-a", "Alpha", "thisPage.Beta + 1"),
              formulaField("f-b", "Beta", "thisPage.Alpha + 1"),
              formulaField("f-chain", "Chain", "thisPage.Alpha + 1"),
            ],
            name: "Db",
          },
        ],
      ])
    );
    const rows = [rowOf("db", "r1", {})];
    const cache: FormulaValueCache = new Map();
    const counter = counterOf();
    // Dirty ONLY the cycle columns: the seeded errors must dirty the
    // dependent themselves.
    const dirty: FormulaDirtyMap = new Map();
    addFormulaDirtyRows(dirty, "db:f-a", FORMULA_ALL_ROWS);
    addFormulaDirtyRows(dirty, "db:f-b", FORMULA_ALL_ROWS);
    evaluateDirtyFormulas(
      graph,
      dirty,
      cache,
      formulaRowsSnapshotOf(new Map([["db", rows]])),
      new Map(),
      { onEvaluate: counter.onEvaluate }
    );

    const alpha = cellOf(cache, "db", "r1", "f-a");
    expect(alpha?.result).toEqual({
      cellValue: null,
      display: "⚠ Circular reference: Alpha → Beta → Alpha",
      isError: true,
    });
    // Seeding is not an evaluation; the dependent's evaluation is real and
    // propagates the error value.
    expect(counter.events).toEqual(["db:f-chain:r1"]);
    const chain = cellOf(cache, "db", "r1", "f-chain");
    expect(chain !== undefined && isFormulaError(chain.value)).toBe(true);
    expect(chain?.result.display).toBe(
      "⚠ Circular reference: Alpha → Beta → Alpha"
    );

    // Re-seeding the identical error is cut off — dependents stay clean.
    const again = counterOf();
    const redirty: FormulaDirtyMap = new Map();
    addFormulaDirtyRows(redirty, "db:f-a", FORMULA_ALL_ROWS);
    evaluateDirtyFormulas(
      graph,
      redirty,
      cache,
      formulaRowsSnapshotOf(new Map([["db", rows]])),
      new Map(),
      { onEvaluate: again.onEvaluate }
    );
    expect(again.events).toEqual([]);
  });

  it("re-evaluates volatile columns on a clock tick with the injected now", () => {
    const graph = buildFormulaGraph(
      new Map<string, FormulaGraphDatabase>([
        [
          "db",
          {
            fields: [formulaField("f-today", "Today", "today()")],
            name: "Db",
          },
        ],
      ])
    );
    const rows = [rowOf("db", "r1", {})];
    const snapshot = formulaRowsSnapshotOf(new Map([["db", rows]]));
    const cache: FormulaValueCache = new Map();
    evaluateDirtyFormulas(graph, dirtyAll(graph), cache, snapshot, new Map(), {
      now: () => new Date("2026-03-05T12:00:00.000Z"),
    });
    expect(cellOf(cache, "db", "r1", "f-today")?.result.cellValue).toBe(
      "2026-03-05"
    );

    const dirty: FormulaDirtyMap = new Map();
    formulaClockTick(graph, dirty);
    evaluateDirtyFormulas(graph, dirty, cache, snapshot, new Map(), {
      now: () => new Date("2026-03-06T12:00:00.000Z"),
    });
    expect(cellOf(cache, "db", "r1", "f-today")?.result.cellValue).toBe(
      "2026-03-06"
    );
  });
});

describe("evaluateDirtyFormulas — scale smoke", () => {
  it("keeps a single-cell edit pass proportional to real dependents", () => {
    const ROW_COUNT = 1000;
    const COLUMN_COUNT = 5;
    const fields: DatabaseField[] = [numberField("s-x", "X")];
    for (let index = 1; index <= COLUMN_COUNT; index += 1) {
      const dep = index === 1 ? "s-x" : `c${index - 1}`;
      fields.push(formulaField(`c${index}`, `C${index}`, `prop("${dep}") + 1`));
    }
    const graph = buildFormulaGraph(
      new Map<string, FormulaGraphDatabase>([
        ["db-s", { fields, name: "Scale" }],
      ])
    );
    const rows = Array.from({ length: ROW_COUNT }, (_, index) =>
      rowOf("db-s", `r${index}`, { "s-x": index })
    );
    const cache: FormulaValueCache = new Map();
    const started = performance.now();
    let count = 0;
    const opts = {
      onEvaluate: () => {
        count += 1;
      },
    };
    evaluateDirtyFormulas(
      graph,
      dirtyAll(graph),
      cache,
      formulaRowsSnapshotOf(new Map([["db-s", rows]])),
      new Map(),
      opts
    );
    expect(count).toBe(ROW_COUNT * COLUMN_COUNT);
    expect(cellOf(cache, "db-s", "r500", `c${COLUMN_COUNT}`)?.value).toBe(
      500 + COLUMN_COUNT
    );

    // One cell edit: evaluations ≤ dependent columns × affected rows.
    count = 0;
    const edited = rows.map((row) =>
      row.id === "r500" ? { ...row, values: { "s-x": 9999 } } : row
    );
    const dirty: FormulaDirtyMap = new Map();
    formulaDataCellChanged(graph, new Map(), dirty, {
      databaseId: "db-s",
      fieldId: "s-x",
      rowId: "r500",
    });
    evaluateDirtyFormulas(
      graph,
      dirty,
      cache,
      formulaRowsSnapshotOf(new Map([["db-s", edited]])),
      new Map(),
      opts
    );
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(COLUMN_COUNT);
    expect(cellOf(cache, "db-s", "r500", `c${COLUMN_COUNT}`)?.value).toBe(
      9999 + COLUMN_COUNT
    );
    // Loose wall guard for both passes together.
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
