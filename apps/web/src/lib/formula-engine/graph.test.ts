import { describe, expect, it } from "vitest";

import { computeFormulaOverlay } from "@/lib/databases/formula-values.ts";
import { prepareUserFunctions } from "@/lib/formula/user-functions.ts";
import {
  buildFormulaGraph,
  type FormulaGraphDatabase,
  formulaColumnKey,
} from "@/lib/formula-engine/graph.ts";
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

function graphOf(entries: Record<string, FormulaGraphDatabase>) {
  return buildFormulaGraph(new Map(Object.entries(entries)));
}

// Two databases: A rolls up B, both same-row and via-relation edges present.
// `a-count` consumes the relation opaquely (null-member traversal) — it must
// NOT get a formula→formula edge even though B has formula columns.
const PIPELINE: Record<string, FormulaGraphDatabase> = {
  "db-a": {
    fields: [
      textField("a-name", "Name"),
      numberField("a-price", "Price"),
      relationField("a-rel", "Tasks", "db-b"),
      formulaField("a-local", "Local", 'prop("a-price") * 2'),
      formulaField("a-grand", "Grand", 'prop("a-local") + 1'),
      formulaField("a-sum", "Sum", 'prop("a-rel").map(r => r.Double).sum()'),
      formulaField("a-count", "Count", 'prop("a-rel").length()'),
    ],
    name: "Projects",
  },
  "db-b": {
    fields: [
      textField("b-name", "Name"),
      numberField("b-est", "Estimate"),
      formulaField("b-double", "Double", 'prop("b-est") * 2'),
    ],
    name: "Tasks",
  },
};

describe("buildFormulaGraph — nodes and grouping", () => {
  it("keys every formula column by databaseId:fieldId", () => {
    const graph = graphOf(PIPELINE);
    expect(formulaColumnKey("db-a", "a-sum")).toBe("db-a:a-sum");
    expect(new Set(graph.columns.keys())).toEqual(
      new Set([
        "db-a:a-local",
        "db-a:a-grand",
        "db-a:a-sum",
        "db-a:a-count",
        "db-b:b-double",
      ])
    );
    expect(
      graph.columnsByDatabase.get("db-a")?.map((column) => column.fieldId)
    ).toEqual(["a-local", "a-grand", "a-sum", "a-count"]);
  });

  it("extracts same-row field ids, traversals, and volatility per column", () => {
    const graph = graphOf({
      "db-a": {
        fields: [
          numberField("a-price", "Price"),
          relationField("a-rel", "Tasks", "db-b"),
          formulaField(
            "a-mix",
            "Mix",
            'prop("a-price") + prop("a-rel").length() + if(today() > today(), 1, 0)'
          ),
        ],
        name: "Projects",
      },
      "db-b": { fields: [textField("b-name", "Name")], name: "Tasks" },
    });
    const column = graph.columns.get("db-a:a-mix");
    expect(column?.sameRowFieldIds).toEqual(new Set(["a-price", "a-rel"]));
    expect(column?.volatile).toBe(true);
    // First hop's null (own-database) source resolves to the concrete id.
    expect(column?.traversals).toEqual([
      {
        memberFieldId: null,
        relationFieldId: "a-rel",
        sourceDatabaseId: "db-a",
        targetDatabaseId: "db-b",
      },
    ]);
  });

  it("keeps blank and unparseable columns as ast-null nodes in the order", () => {
    const graph = graphOf({
      db: {
        fields: [
          formulaField("f-blank", "Blank", "   "),
          formulaField("f-broken", "Broken", "1 +"),
        ],
        name: "Db",
      },
    });
    expect(graph.columns.get("db:f-blank")?.ast).toBeNull();
    expect(graph.columns.get("db:f-broken")?.ast).toBeNull();
    expect(graph.order.map((column) => column.key)).toEqual([
      "db:f-blank",
      "db:f-broken",
    ]);
  });
});

describe("buildFormulaGraph — topological order and edges", () => {
  it("orders dependencies before dependents across two databases", () => {
    const graph = graphOf(PIPELINE);
    const keys = graph.order.map((column) => column.key);
    expect(new Set(keys)).toEqual(new Set(graph.columns.keys()));
    expect(keys.indexOf("db-b:b-double")).toBeLessThan(
      keys.indexOf("db-a:a-sum")
    );
    expect(keys.indexOf("db-a:a-local")).toBeLessThan(
      keys.indexOf("db-a:a-grand")
    );
  });

  it("annotates same-row and via-relation dependency edges", () => {
    const graph = graphOf(PIPELINE);
    expect(
      graph.dependents
        .get("db-a:a-local")
        ?.map((edge) => [edge.column.key, edge.mapping])
    ).toEqual([["db-a:a-grand", { kind: "sameRow" }]]);
    // The cross-database edge carries the relation hop for row mapping; the
    // opaque `a-count` consumer gets NO edge (null-member traversal).
    expect(
      graph.dependents
        .get("db-b:b-double")
        ?.map((edge) => [edge.column.key, edge.mapping])
    ).toEqual([
      [
        "db-a:a-sum",
        {
          kind: "viaRelation",
          relationFieldId: "a-rel",
          sourceDatabaseId: "db-a",
        },
      ],
    ]);
    expect(graph.columns.get("db-a:a-count")?.traversals).toEqual([
      {
        memberFieldId: null,
        relationFieldId: "a-rel",
        sourceDatabaseId: "db-a",
        targetDatabaseId: "db-b",
      },
    ]);
  });

  it("registers every traversed relation field for reverse indexing", () => {
    const graph = graphOf({
      "db-a": {
        fields: [
          relationField("a-rel", "Tasks", "db-b"),
          formulaField(
            "a-deep",
            "Deep",
            'prop("a-rel").map(b => b.Steps.map(c => c.Hours).sum()).sum()'
          ),
        ],
        name: "Projects",
      },
      "db-b": {
        fields: [relationField("b-rel-c", "Steps", "db-c")],
        name: "Tasks",
      },
      "db-c": { fields: [numberField("c-hours", "Hours")], name: "Steps" },
    });
    // Chained hops register BOTH relations, each keyed to its owner database.
    expect(graph.relationFields.get("a-rel")).toEqual({
      databaseId: "db-a",
      targetDatabaseId: "db-b",
    });
    expect(graph.relationFields.get("b-rel-c")).toEqual({
      databaseId: "db-b",
      targetDatabaseId: "db-c",
    });
    expect(graph.columns.get("db-a:a-deep")?.traversals).toEqual([
      {
        memberFieldId: "b-rel-c",
        relationFieldId: "a-rel",
        sourceDatabaseId: "db-a",
        targetDatabaseId: "db-b",
      },
      {
        memberFieldId: "c-hours",
        relationFieldId: "b-rel-c",
        sourceDatabaseId: "db-b",
        targetDatabaseId: "db-c",
      },
    ]);
  });

  it("edges db() references naming a formula member with allRows mapping", () => {
    const graph = graphOf({
      "db-a": {
        fields: [
          formulaField("a-sum", "Sum", 'db("db-b").map(r => r.Double).sum()'),
          formulaField("a-grand", "Grand", 'prop("a-sum") + 1'),
          formulaField("a-count", "Count", 'db("db-b").length()'),
        ],
        name: "Projects",
      },
      "db-b": {
        fields: [
          numberField("b-est", "Estimate"),
          formulaField("b-double", "Double", 'prop("b-est") * 2'),
        ],
        name: "Tasks",
      },
    });
    // The db() ref with an explicit formula member DOES edge (ordering +
    // propagation), with the coarse allRows mapping; the opaque `.length()`
    // consumer gets no edge — same explicit-member rule as relations.
    expect(
      graph.dependents
        .get("db-b:b-double")
        ?.map((edge) => [edge.column.key, edge.mapping])
    ).toEqual([["db-a:a-sum", { kind: "allRows" }]]);
    expect(graph.columns.get("db-a:a-sum")?.databaseRefs).toEqual([
      { memberFieldId: "b-double", targetDatabaseId: "db-b" },
    ]);
    expect(graph.columns.get("db-a:a-count")?.databaseRefs).toEqual([
      { memberFieldId: null, targetDatabaseId: "db-b" },
    ]);
    const keys = graph.order.map((column) => column.key);
    expect(keys.indexOf("db-b:b-double")).toBeLessThan(
      keys.indexOf("db-a:a-sum")
    );
    // The db() edge composes with the downstream same-row edge.
    expect(
      graph.dependents
        .get("db-a:a-sum")
        ?.map((edge) => [edge.column.key, edge.mapping])
    ).toEqual([["db-a:a-grand", { kind: "sameRow" }]]);
    // db() refs register no relation field — there is no reverse index.
    expect(graph.relationFields.size).toBe(0);
  });
});

describe("buildFormulaGraph — cycles", () => {
  const CROSS_CYCLE: Record<string, FormulaGraphDatabase> = {
    "db-a": {
      fields: [
        relationField("a-rel", "Tasks", "db-b"),
        formulaField("a-f", "AF", 'prop("a-rel").first().BRoll'),
        formulaField("a-chain", "Chain", 'prop("a-f") + 1'),
      ],
      name: "Projects",
    },
    "db-b": {
      fields: [
        relationField("b-rel", "Projects", "db-a"),
        formulaField("b-roll", "BRoll", 'prop("b-rel").first().AF'),
      ],
      name: "Tasks",
    },
  };

  it("names cross-database cycles with db-qualified field names", () => {
    const graph = graphOf(CROSS_CYCLE);
    expect(graph.columns.get("db-a:a-f")?.cycleError?.message).toBe(
      "Circular reference: Projects.AF → Tasks.BRoll → Projects.AF"
    );
    expect(graph.columns.get("db-b:b-roll")?.cycleError?.message).toBe(
      "Circular reference: Tasks.BRoll → Projects.AF → Tasks.BRoll"
    );
  });

  it("excludes cycle columns from the order but keeps their dependents", () => {
    const graph = graphOf(CROSS_CYCLE);
    const keys = graph.order.map((column) => column.key);
    expect(keys).not.toContain("db-a:a-f");
    expect(keys).not.toContain("db-b:b-roll");
    // The column depending on a cycle member evaluates normally: no cycle
    // error of its own, present in the order, wired as the cycle column's
    // dependent so the seeded error propagates to it.
    const chain = graph.columns.get("db-a:a-chain");
    expect(chain?.cycleError).toBeNull();
    expect(keys).toContain("db-a:a-chain");
    const edges = graph.dependents
      .get("db-a:a-f")
      ?.map((edge) => [edge.column.key, edge.mapping]);
    expect(edges).toContainEqual(["db-a:a-chain", { kind: "sameRow" }]);
    // The cycle-internal edge is kept too (b-roll reads a-f via b-rel).
    expect(edges).toContainEqual([
      "db-b:b-roll",
      {
        kind: "viaRelation",
        relationFieldId: "b-rel",
        sourceDatabaseId: "db-b",
      },
    ]);
  });

  it("names same-database cycles exactly like the per-database overlay", () => {
    const alpha = formulaField("f-a", "Alpha", "thisPage.Beta + 1");
    const beta = formulaField("f-b", "Beta", "thisPage.Alpha + 1");
    const graph = graphOf({ db: { fields: [alpha, beta], name: "Db" } });
    const message = graph.columns.get("db:f-a")?.cycleError?.message;
    expect(message).toBe("Circular reference: Alpha → Beta → Alpha");

    // Parity: the pre-engine overlay produces the identical message (names
    // NOT db-qualified for a cycle inside one database).
    const row: LocalDatabaseRow = {
      createdAt: "2026-01-01T00:00:00.000Z",
      databaseId: "db",
      id: "r1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      values: {},
    };
    const overlay = computeFormulaOverlay([alpha, beta], [row]);
    expect(overlay.get("r1")?.["f-a"].display).toBe(`⚠ ${message}`);
  });

  it("reports a self-reference as a single-column cycle", () => {
    const graph = graphOf({
      db: {
        fields: [formulaField("f-self", "Self", "thisPage.Self + 1")],
        name: "Db",
      },
    });
    expect(graph.columns.get("db:f-self")?.cycleError?.message).toBe(
      "Circular reference: Self → Self"
    );
    expect(graph.order).toEqual([]);
  });

  it("names cycles built from db() formula members", () => {
    const graph = graphOf({
      "db-a": {
        fields: [formulaField("a-f", "AF", 'db("db-b").first().BRoll')],
        name: "Projects",
      },
      "db-b": {
        fields: [formulaField("b-roll", "BRoll", 'db("db-a").first().AF')],
        name: "Tasks",
      },
    });
    expect(graph.columns.get("db-a:a-f")?.cycleError?.message).toBe(
      "Circular reference: Projects.AF → Tasks.BRoll → Projects.AF"
    );
    expect(graph.order).toEqual([]);
  });

  it("does not manufacture cycles from null-member traversals", () => {
    // A consumes B's rows opaquely; B rolls up A's formula — without the
    // explicit-member rule this would be a false A↔B cycle.
    const graph = graphOf({
      "db-a": {
        fields: [
          relationField("a-rel", "Tasks", "db-b"),
          formulaField("a-count", "Count", 'prop("a-rel").length()'),
        ],
        name: "Projects",
      },
      "db-b": {
        fields: [
          relationField("b-rel", "Projects", "db-a"),
          formulaField(
            "b-roll",
            "Roll",
            'prop("b-rel").map(r => r.Count).sum()'
          ),
        ],
        name: "Tasks",
      },
    });
    expect(graph.columns.get("db-a:a-count")?.cycleError).toBeNull();
    expect(graph.columns.get("db-b:b-roll")?.cycleError).toBeNull();
    const keys = graph.order.map((column) => column.key);
    expect(keys.indexOf("db-a:a-count")).toBeLessThan(
      keys.indexOf("db-b:b-roll")
    );
  });
});

describe("buildFormulaGraph — user-defined functions", () => {
  const FUNCTIONS = prepareUserFunctions([
    {
      expression: 'prop("a-local") + bump',
      name: "bumpedLocal",
      params: ["bump"],
    },
    {
      expression: "rel.map(r => r.Double).sum()",
      name: "sumDouble",
      params: ["rel"],
    },
    { expression: "now()", name: "stamp", params: [] },
  ]);

  it("edges same-row formula deps read inside a called body", () => {
    const graph = buildFormulaGraph(
      new Map(
        Object.entries({
          "db-a": {
            fields: [
              numberField("a-price", "Price"),
              formulaField("a-local", "Local", 'prop("a-price") * 2'),
              formulaField("a-user", "User", "bumpedLocal(1)"),
            ],
            name: "Projects",
          },
        })
      ),
      FUNCTIONS
    );
    const dependents = graph.dependents.get(
      formulaColumnKey("db-a", "a-local")
    );
    expect(dependents?.map((edge) => edge.column.fieldId)).toContain("a-user");
    expect(
      dependents?.find((edge) => edge.column.fieldId === "a-user")?.mapping
    ).toEqual({ kind: "sameRow" });
    // Order respects the dependency: a-local before a-user.
    const order = graph.order.map((column) => column.fieldId);
    expect(order.indexOf("a-local")).toBeLessThan(order.indexOf("a-user"));
  });

  it("edges cross-database traversals composed through an argument", () => {
    const graph = buildFormulaGraph(
      new Map(
        Object.entries({
          "db-a": {
            fields: [
              relationField("a-rel", "Tasks", "db-b"),
              formulaField("a-roll", "Roll", 'sumDouble(prop("a-rel"))'),
            ],
            name: "Projects",
          },
          "db-b": {
            fields: [
              numberField("b-est", "Estimate"),
              formulaField("b-double", "Double", 'prop("b-est") * 2'),
            ],
            name: "Tasks",
          },
        })
      ),
      FUNCTIONS
    );
    const dependents = graph.dependents.get(
      formulaColumnKey("db-b", "b-double")
    );
    expect(dependents).toEqual([
      expect.objectContaining({
        mapping: {
          kind: "viaRelation",
          relationFieldId: "a-rel",
          sourceDatabaseId: "db-a",
        },
      }),
    ]);
    expect(graph.relationFields.get("a-rel")).toEqual({
      databaseId: "db-a",
      targetDatabaseId: "db-b",
    });
  });

  it("marks callers of clock-reading bodies volatile", () => {
    const graph = buildFormulaGraph(
      new Map(
        Object.entries({
          "db-a": {
            fields: [formulaField("a-stamp", "Stamp", "stamp()")],
            name: "Projects",
          },
        })
      ),
      FUNCTIONS
    );
    expect(
      graph.columns.get(formulaColumnKey("db-a", "a-stamp"))?.volatile
    ).toBe(true);
  });

  it("changing the registry changes the graph (definition-change rebuild)", () => {
    const databases = new Map(
      Object.entries({
        "db-a": {
          fields: [
            numberField("a-price", "Price"),
            formulaField("a-local", "Local", 'prop("a-price") * 2'),
            formulaField("a-user", "User", "readsLocal()"),
          ],
          name: "Projects",
        },
      })
    );
    const before = buildFormulaGraph(
      databases,
      prepareUserFunctions([
        { expression: "1", name: "readsLocal", params: [] },
      ])
    );
    expect(
      before.dependents.get(formulaColumnKey("db-a", "a-local")) ?? []
    ).toEqual([]);
    const after = buildFormulaGraph(
      databases,
      prepareUserFunctions([
        { expression: 'prop("a-local")', name: "readsLocal", params: [] },
      ])
    );
    expect(
      after.dependents
        .get(formulaColumnKey("db-a", "a-local"))
        ?.map((edge) => edge.column.fieldId)
    ).toEqual(["a-user"]);
  });
});
