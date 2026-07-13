import { describe, expect, it } from "vitest";

import type { FormulaCheckContext } from "@/lib/formula/check.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import {
  type FormulaStaticReferences,
  formulaStaticReferences,
} from "@/lib/formula/references.ts";
import { NUMBER_TYPE, TEXT_TYPE, UNKNOWN_TYPE } from "@/lib/formula/types.ts";

// Own database (A): a couple of data fields, a relation into B, a second
// relation into B, and a formula field.
const CONTEXT: FormulaCheckContext = {
  databases: new Map([
    [
      "db-b",
      {
        name: "Tasks",
        properties: [
          { id: "b-name", kind: "text", name: "Name", type: TEXT_TYPE },
          { id: "b-est", kind: "number", name: "Estimate", type: NUMBER_TYPE },
          // Id/name collision pair: the member name "best" is BOTH a field
          // id and another field's name — the id must win (id-then-name).
          { id: "best", kind: "number", name: "Points", type: NUMBER_TYPE },
          { id: "b-decoy", kind: "text", name: "best", type: TEXT_TYPE },
          {
            id: "b-rel-c",
            kind: "relation",
            name: "Steps",
            targetDatabaseId: "db-c",
            type: UNKNOWN_TYPE,
          },
        ],
      },
    ],
    [
      "db-c",
      {
        name: "Steps",
        properties: [
          { id: "c-name", kind: "text", name: "Name", type: TEXT_TYPE },
          { id: "c-hours", kind: "number", name: "Hours", type: NUMBER_TYPE },
        ],
      },
    ],
  ]),
  properties: [
    { id: "a-name", kind: "text", name: "Name", type: TEXT_TYPE },
    { id: "a-price", kind: "number", name: "Price", type: NUMBER_TYPE },
    {
      id: "a-rel",
      kind: "relation",
      name: "Tasks",
      targetDatabaseId: "db-b",
      type: UNKNOWN_TYPE,
    },
    {
      id: "a-rel2",
      kind: "relation",
      name: "More Tasks",
      targetDatabaseId: "db-b",
      type: UNKNOWN_TYPE,
    },
    { id: "a-total", kind: "formula", name: "Total", type: NUMBER_TYPE },
  ],
};

function refs(expression: string): FormulaStaticReferences {
  const parsed = parseFormula(expression);
  if (!parsed.ok) {
    throw new Error(`fixture does not parse: ${expression}`);
  }
  return formulaStaticReferences(parsed.ast, CONTEXT);
}

describe("formulaStaticReferences — same-row references", () => {
  it("collects canonical prop(id) references", () => {
    expect([...refs('prop("a-price") * 2').sameRowFieldIds]).toEqual([
      "a-price",
    ]);
  });

  it("resolves thisPage.Name references by normalized name", () => {
    expect([
      ...refs("thisPage.Price + thisPage.Total").sameRowFieldIds,
    ]).toEqual(["a-price", "a-total"]);
  });

  it("resolves the id-then-name rule the checker uses", () => {
    // "a-price" is an exact id even via the scope spelling.
    expect([...refs('thisPage["a-price"]').sameRowFieldIds]).toEqual([
      "a-price",
    ]);
  });

  it("keeps unresolved prop(id) references so tracking can heal", () => {
    expect([...refs('prop("gone-field") + 1').sameRowFieldIds]).toEqual([
      "gone-field",
    ]);
  });

  it("includes a relation field consumed with member access", () => {
    const result = refs('prop("a-rel").map(r => r.Estimate).sum()');
    expect(result.sameRowFieldIds.has("a-rel")).toBe(true);
  });

  it("does not treat lambda parameters or let bindings as references", () => {
    const result = refs("let(x, 1, x + [2].map(y => y).sum())");
    expect(result.sameRowFieldIds.size).toBe(0);
  });
});

describe("formulaStaticReferences — volatility", () => {
  it("flags now()/today() formulas", () => {
    expect(refs("now()").volatile).toBe(true);
    expect(
      refs('dateDiff(today(), prop("a-price") + today(), "days")').volatile
    ).toBe(true);
  });

  it("does not flag clock-free formulas", () => {
    expect(refs('prop("a-price") * 2').volatile).toBe(false);
  });
});

describe("formulaStaticReferences — traversals", () => {
  it("extracts a map-lambda member traversal without a null-member one", () => {
    const result = refs('prop("a-rel").map(r => r.Estimate).sum()');
    expect(result.traversals).toEqual([
      {
        memberFieldId: "b-est",
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
    ]);
  });

  it("resolves members by exact field id before names", () => {
    const result = refs('prop("a-rel").map(r => r.best).sum()');
    // "best" is field id "best" (Points) AND field "b-decoy"'s name — the
    // exact id wins, mirroring resolveFormulaRowMember.
    expect(result.traversals[0]?.memberFieldId).toBe("best");
  });

  it("extracts members on first()/last() of a relation", () => {
    expect(refs('first(prop("a-rel")).Estimate').traversals).toEqual([
      {
        memberFieldId: "b-est",
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
    ]);
    expect(refs('prop("a-rel").last().Name').traversals).toEqual([
      {
        memberFieldId: "b-name",
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
    ]);
  });

  it("emits a null-member traversal for a relation consumed without members", () => {
    expect(refs('prop("a-rel").length()').traversals).toEqual([
      {
        memberFieldId: null,
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
    ]);
  });

  it("emits a null-member traversal when the relation is the result (labels)", () => {
    expect(refs('prop("a-rel")').traversals).toEqual([
      {
        memberFieldId: null,
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
    ]);
  });

  it("keeps filter passthrough rows precise AND label-safe as the result", () => {
    const result = refs('prop("a-rel").filter(r => r.Estimate > 2)');
    expect(result.traversals).toContainEqual({
      memberFieldId: "b-est",
      relationFieldId: "a-rel",
      sourceDatabaseId: null,
      targetDatabaseId: "db-b",
    });
    // The filtered rows escape as the result — labels read any target row.
    expect(result.traversals).toContainEqual({
      memberFieldId: null,
      relationFieldId: "a-rel",
      sourceDatabaseId: null,
      targetDatabaseId: "db-b",
    });
  });

  it("resolves unresolvable member names to memberFieldId null", () => {
    expect(refs('prop("a-rel").first().Nonexistent').traversals).toEqual([
      {
        memberFieldId: null,
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
    ]);
  });

  it("resolves members to null when the target database is unknown", () => {
    const context: FormulaCheckContext = {
      properties: CONTEXT.properties,
      // No databases map at all.
    };
    const parsed = parseFormula('prop("a-rel").first().Estimate');
    if (!parsed.ok) {
      throw new Error("fixture does not parse");
    }
    expect(formulaStaticReferences(parsed.ast, context).traversals).toEqual([
      {
        memberFieldId: null,
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
    ]);
  });

  it("extracts BOTH hops of a chained traversal (A→B→C)", () => {
    const result = refs(
      'prop("a-rel").map(b => b.Steps.map(c => c.Hours).sum()).sum()'
    );
    expect(result.traversals).toEqual([
      {
        memberFieldId: "b-rel-c",
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
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

  it("chains through first() hops too", () => {
    const result = refs('prop("a-rel").first().Steps.first().Hours');
    expect(result.traversals).toEqual([
      {
        memberFieldId: "b-rel-c",
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
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

  it("marks a chained hop consumed opaquely with a null member", () => {
    const result = refs('prop("a-rel").map(b => b.Steps.length()).sum()');
    expect(result.traversals).toEqual([
      {
        memberFieldId: "b-rel-c",
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
      {
        memberFieldId: null,
        relationFieldId: "b-rel-c",
        sourceDatabaseId: "db-b",
        targetDatabaseId: "db-c",
      },
    ]);
  });

  it("tracks provenance through let bindings", () => {
    expect(
      refs('let(x, prop("a-rel"), x.first().Estimate)').traversals
    ).toEqual([
      {
        memberFieldId: "b-est",
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
    ]);
  });

  it("tracks provenance through if branches (both sides)", () => {
    const result = refs(
      'if(prop("a-price") > 0, prop("a-rel"), prop("a-rel2")).length()'
    );
    expect(result.traversals).toContainEqual({
      memberFieldId: null,
      relationFieldId: "a-rel",
      sourceDatabaseId: null,
      targetDatabaseId: "db-b",
    });
    expect(result.traversals).toContainEqual({
      memberFieldId: null,
      relationFieldId: "a-rel2",
      sourceDatabaseId: null,
      targetDatabaseId: "db-b",
    });
  });

  it("keeps two relations into the same target distinct", () => {
    const result = refs(
      'prop("a-rel").map(r => r.Estimate).sum() + prop("a-rel2").map(r => r.Estimate).sum()'
    );
    expect(result.traversals).toEqual([
      {
        memberFieldId: "b-est",
        relationFieldId: "a-rel",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
      {
        memberFieldId: "b-est",
        relationFieldId: "a-rel2",
        sourceDatabaseId: null,
        targetDatabaseId: "db-b",
      },
    ]);
  });

  it("falls back to a null-member traversal for un-analyzable lambda values", () => {
    // A let-bound function value in a map position: the body is walked at
    // the binding (no provenance), so the list rows degrade conservatively.
    const result = refs('let(f, r => r.Estimate, prop("a-rel").map(f).sum())');
    expect(result.traversals).toContainEqual({
      memberFieldId: null,
      relationFieldId: "a-rel",
      sourceDatabaseId: null,
      targetDatabaseId: "db-b",
    });
  });

  it("deduplicates repeated traversals", () => {
    const result = refs(
      'prop("a-rel").map(r => r.Estimate).sum() + prop("a-rel").map(r => r.Estimate).max()'
    );
    expect(result.traversals).toHaveLength(1);
  });

  it("extracts no traversals from row-free formulas", () => {
    expect(refs('prop("a-price") * 2 + len(thisPage.Name)').traversals).toEqual(
      []
    );
  });
});
