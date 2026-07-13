import { describe, expect, it } from "vitest";

import {
  buildFormulaGraph,
  type FormulaGraphDatabase,
} from "@/lib/formula-engine/graph.ts";
import {
  applyFormulaRelationDiff,
  buildFormulaReverseIndexes,
  type FormulaReverseIndexes,
  formulaReferrersOf,
  relationCellTargetIds,
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

// A→B (a-rel, traversed by a rollup) and B→C (b-rel-c, traversed via a
// chained hop). `a-other` is a relation NO formula traverses — it must not
// be indexed.
const DATABASES = new Map<string, FormulaGraphDatabase>([
  [
    "db-a",
    {
      fields: [
        relationField("a-rel", "Tasks", "db-b"),
        relationField("a-other", "Other", "db-b"),
        formulaField(
          "a-roll",
          "Roll",
          'prop("a-rel").map(r => r.Estimate).sum()'
        ),
        formulaField(
          "a-deep",
          "Deep",
          'prop("a-rel").map(b => b.Steps.map(c => c.Hours).sum()).sum()'
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
        relationField("b-rel-c", "Steps", "db-c"),
      ],
      name: "Tasks",
    },
  ],
  ["db-c", { fields: [numberField("c-hours", "Hours")], name: "Steps" }],
]);

const GRAPH = buildFormulaGraph(DATABASES);

const ROWS_BY_DB = new Map<string, readonly LocalDatabaseRow[]>([
  [
    "db-a",
    [
      rowOf("db-a", "a1", { "a-rel": ["b1", "b2"] }),
      // Stale target id kept; a-other links must not be indexed; non-array
      // relation cells are skipped, not crashed on.
      rowOf("db-a", "a2", { "a-other": ["b1"], "a-rel": ["b2", "b-stale"] }),
      rowOf("db-a", "a3", { "a-rel": "not-a-list" }),
    ],
  ],
  ["db-b", [rowOf("db-b", "b1", { "b-rel-c": ["c1"] })]],
]);

function builtIndexes(): FormulaReverseIndexes {
  return buildFormulaReverseIndexes(GRAPH, (databaseId) =>
    ROWS_BY_DB.get(databaseId)
  );
}

describe("relationCellTargetIds", () => {
  it("reads id arrays and treats every other shape as empty", () => {
    expect(relationCellTargetIds(["b1", "b2"])).toEqual(["b1", "b2"]);
    expect(relationCellTargetIds(null)).toEqual([]);
    expect(relationCellTargetIds(undefined)).toEqual([]);
    expect(relationCellTargetIds("b1")).toEqual([]);
    expect(relationCellTargetIds(5)).toEqual([]);
  });
});

describe("buildFormulaReverseIndexes", () => {
  it("indexes each traversed relation from its owner database's rows", () => {
    const indexes = builtIndexes();
    expect(formulaReferrersOf(indexes, "a-rel", "b1")).toEqual(new Set(["a1"]));
    expect(formulaReferrersOf(indexes, "a-rel", "b2")).toEqual(
      new Set(["a1", "a2"])
    );
    expect(formulaReferrersOf(indexes, "b-rel-c", "c1")).toEqual(
      new Set(["b1"])
    );
  });

  it("records referrers of stale target ids (restore can dirty them)", () => {
    expect(formulaReferrersOf(builtIndexes(), "a-rel", "b-stale")).toEqual(
      new Set(["a2"])
    );
  });

  it("does not index relations no formula traverses", () => {
    const indexes = builtIndexes();
    expect(indexes.has("a-other")).toBe(false);
    expect(formulaReferrersOf(indexes, "a-other", "b1")).toEqual(new Set());
  });

  it("reads unknown targets and unknown relation fields as empty", () => {
    const indexes = builtIndexes();
    expect(formulaReferrersOf(indexes, "a-rel", "b-unknown")).toEqual(
      new Set()
    );
    expect(formulaReferrersOf(indexes, "not-indexed", "b1")).toEqual(new Set());
  });

  it("creates an empty maintainable index when the owner has no rows", () => {
    const indexes = buildFormulaReverseIndexes(GRAPH, () => undefined);
    expect(indexes.has("a-rel")).toBe(true);
    expect(indexes.has("b-rel-c")).toBe(true);
    expect(formulaReferrersOf(indexes, "a-rel", "b1")).toEqual(new Set());
    // Incremental appliers can populate it from scratch.
    applyFormulaRelationDiff(indexes, "a-rel", "a9", [], ["b9"]);
    expect(formulaReferrersOf(indexes, "a-rel", "b9")).toEqual(new Set(["a9"]));
  });
});

describe("applyFormulaRelationDiff", () => {
  it("applies link diffs: new targets gain the source row", () => {
    const indexes = builtIndexes();
    applyFormulaRelationDiff(
      indexes,
      "a-rel",
      "a1",
      ["b1", "b2"],
      ["b1", "b2", "b3"]
    );
    expect(formulaReferrersOf(indexes, "a-rel", "b1")).toEqual(new Set(["a1"]));
    expect(formulaReferrersOf(indexes, "a-rel", "b3")).toEqual(new Set(["a1"]));
  });

  it("applies unlink diffs: dropped targets lose the source row", () => {
    const indexes = builtIndexes();
    applyFormulaRelationDiff(indexes, "a-rel", "a1", ["b1", "b2"], ["b2"]);
    expect(formulaReferrersOf(indexes, "a-rel", "b1")).toEqual(new Set());
    expect(formulaReferrersOf(indexes, "a-rel", "b2")).toEqual(
      new Set(["a1", "a2"])
    );
  });

  it("applies retarget diffs in one call, leaving shared targets alone", () => {
    const indexes = builtIndexes();
    applyFormulaRelationDiff(
      indexes,
      "a-rel",
      "a1",
      ["b1", "b2"],
      ["b2", "b4"]
    );
    expect(formulaReferrersOf(indexes, "a-rel", "b1")).toEqual(new Set());
    expect(formulaReferrersOf(indexes, "a-rel", "b2")).toEqual(
      new Set(["a1", "a2"])
    );
    expect(formulaReferrersOf(indexes, "a-rel", "b4")).toEqual(new Set(["a1"]));
  });

  it("evicts a removed source row's outgoing links with an empty new list", () => {
    const indexes = builtIndexes();
    applyFormulaRelationDiff(indexes, "a-rel", "a2", ["b2", "b-stale"], []);
    expect(formulaReferrersOf(indexes, "a-rel", "b2")).toEqual(new Set(["a1"]));
    expect(formulaReferrersOf(indexes, "a-rel", "b-stale")).toEqual(new Set());
  });

  it("is a no-op for relation fields the graph does not index", () => {
    const indexes = builtIndexes();
    applyFormulaRelationDiff(indexes, "a-other", "a2", ["b1"], ["b2"]);
    expect(indexes.has("a-other")).toBe(false);
  });

  it("tolerates stale unlinks of targets that were never indexed", () => {
    const indexes = builtIndexes();
    applyFormulaRelationDiff(indexes, "a-rel", "a1", ["b-never"], []);
    expect(formulaReferrersOf(indexes, "a-rel", "b-never")).toEqual(new Set());
  });
});
