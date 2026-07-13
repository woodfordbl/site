/**
 * The cross-database formula column graph (proposal §5.1): nodes are formula
 * COLUMNS (`databaseId:fieldId`), edges are the static formula→formula
 * dependencies extracted from checked ASTs, each annotated with a row
 * mapping — `sameRow` for a dependency inside the same database,
 * `viaRelation` when the dependent reads the dependency through a relation
 * traversal (a change in a target row maps to referrer rows through the
 * relation field's reverse index).
 *
 * Pure snapshot → graph: build from every database's schema; no collections,
 * no subscriptions (P3.3b owns instances and rebuilds on schema change).
 * Cycles — same-database or cross-database — yield per-column named error
 * VALUES exactly like the per-database overlay plan (`Circular reference:
 * A → B → A`, names db-qualified when the cycle spans databases); cycle
 * columns are excluded from the topological order and their error seeds the
 * value cache, while columns depending on a cycle evaluate normally and
 * propagate the error value.
 *
 * Cross-database edges exist only for traversals naming an explicit formula
 * member (`memberFieldId` = a formula field of the target). A null-member
 * traversal ("any field of the target") deliberately creates NO
 * formula→formula edge: nothing in the language can read a target formula
 * without naming it (row labels read the target's primary DATA field), and
 * edging every target formula would manufacture false cycles.
 */

import { formulaCheckContext } from "@/lib/databases/formula-values.ts";
import type { FormulaNode } from "@/lib/formula/ast.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import {
  type FormulaTraversal,
  formulaStaticReferences,
} from "@/lib/formula/references.ts";
import { type FormulaError, formulaError } from "@/lib/formula/values.ts";
import {
  formulaCycleMessage,
  formulaCyclePathFrom,
  formulaTopoOrder,
} from "@/lib/formula-engine/topo.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

/** One database's schema slice the graph builds from. */
export interface FormulaGraphDatabase {
  readonly fields: readonly DatabaseField[];
  readonly name: string;
}

/** A traversal with the first hop's owner database resolved. */
export interface FormulaColumnTraversal {
  readonly memberFieldId: string | null;
  readonly relationFieldId: string;
  /** Database owning the relation field (never null once in the graph). */
  readonly sourceDatabaseId: string;
  readonly targetDatabaseId: string;
}

/** How a dependency's changed row maps to the dependent column's rows. */
export type FormulaRowMapping =
  | { readonly kind: "sameRow" }
  | {
      readonly kind: "viaRelation";
      readonly relationFieldId: string;
      readonly sourceDatabaseId: string;
    };

/** One formula column node. */
export interface FormulaColumnNode {
  /** Parsed expression, or null for blank/unparseable (cells stay blank). */
  readonly ast: FormulaNode | null;
  /** Named cycle error when this column is on a reference cycle. */
  readonly cycleError: FormulaError | null;
  readonly databaseId: string;
  readonly fieldId: string;
  readonly fieldName: string;
  /** `databaseId:fieldId` — the graph/dirty-set key. */
  readonly key: string;
  /** Same-row field ids this column reads (data + formula + relation). */
  readonly sameRowFieldIds: ReadonlySet<string>;
  /** Relation traversals, first hop's `sourceDatabaseId` resolved. */
  readonly traversals: readonly FormulaColumnTraversal[];
  /** Whether the expression reads the clock (`now()`/`today()`). */
  readonly volatile: boolean;
}

/** One dependency edge, stored on the DEPENDENCY pointing at its dependent. */
export interface FormulaColumnEdge {
  readonly column: FormulaColumnNode;
  readonly mapping: FormulaRowMapping;
}

/** One relation field the engine must keep a reverse index for. */
export interface FormulaIndexedRelation {
  /** Database owning the relation field (its rows are the index sources). */
  readonly databaseId: string;
  readonly targetDatabaseId: string;
}

/** The built graph — plain data, owned by the caller. */
export interface FormulaGraph {
  readonly columns: ReadonlyMap<string, FormulaColumnNode>;
  readonly columnsByDatabase: ReadonlyMap<string, readonly FormulaColumnNode[]>;
  /** The schema snapshot the graph was built from. */
  readonly databases: ReadonlyMap<string, FormulaGraphDatabase>;
  /** Dependents of each column key, with row-mapping annotations. */
  readonly dependents: ReadonlyMap<string, readonly FormulaColumnEdge[]>;
  /** Global topological order across databases; cycle columns excluded. */
  readonly order: readonly FormulaColumnNode[];
  /** Relation fields appearing in any traversal, keyed by field id. */
  readonly relationFields: ReadonlyMap<string, FormulaIndexedRelation>;
}

/** The graph/dirty-map key of one formula column. */
export function formulaColumnKey(databaseId: string, fieldId: string): string {
  return `${databaseId}:${fieldId}`;
}

function parseExpression(expression: string): FormulaNode | null {
  if (expression.trim() === "") {
    return null;
  }
  const parsed = parseFormula(expression);
  return parsed.ok ? parsed.ast : null;
}

/** Resolve a traversal's null (own-database) source to the concrete id. */
function resolveTraversal(
  traversal: FormulaTraversal,
  ownDatabaseId: string
): FormulaColumnTraversal {
  return {
    memberFieldId: traversal.memberFieldId,
    relationFieldId: traversal.relationFieldId,
    sourceDatabaseId: traversal.sourceDatabaseId ?? ownDatabaseId,
    targetDatabaseId: traversal.targetDatabaseId,
  };
}

/** Column under construction: `cycleError` is assigned after cycle DFS. */
type MutableColumnNode = Omit<FormulaColumnNode, "cycleError"> & {
  cycleError: FormulaError | null;
};

function buildColumns(
  databases: ReadonlyMap<string, FormulaGraphDatabase>
): MutableColumnNode[] {
  const related = [...databases].map(([id, database]) => ({
    // `FormulaRelatedDatabase.fields` is a mutable array type; copy.
    fields: [...database.fields],
    id,
    name: database.name,
  }));
  const columns: MutableColumnNode[] = [];
  for (const [databaseId, database] of databases) {
    const context = formulaCheckContext(database.fields, related);
    for (const field of database.fields) {
      if (field.type !== "formula") {
        continue;
      }
      const ast = parseExpression(field.expression);
      const references =
        ast === null ? null : formulaStaticReferences(ast, context);
      columns.push({
        ast,
        cycleError: null,
        databaseId,
        fieldId: field.id,
        fieldName: field.name,
        key: formulaColumnKey(databaseId, field.id),
        sameRowFieldIds: references?.sameRowFieldIds ?? new Set(),
        traversals:
          references?.traversals.map((traversal) =>
            resolveTraversal(traversal, databaseId)
          ) ?? [],
        volatile: references?.volatile ?? false,
      });
    }
  }
  return columns;
}

/** Formula field ids per database, for edge/dep resolution. */
function formulaFieldIdsByDatabase(
  databases: ReadonlyMap<string, FormulaGraphDatabase>
): Map<string, Set<string>> {
  const byDatabase = new Map<string, Set<string>>();
  for (const [databaseId, database] of databases) {
    const ids = new Set<string>();
    for (const field of database.fields) {
      if (field.type === "formula") {
        ids.add(field.id);
      }
    }
    byDatabase.set(databaseId, ids);
  }
  return byDatabase;
}

/**
 * The formula columns `column` depends on, as `[depKey, mapping]` pairs:
 * same-row references to formula fields of its own database, plus traversals
 * whose explicit member is a formula field of the target database.
 */
function dependencyEdgesOf(
  column: MutableColumnNode,
  formulaIds: ReadonlyMap<string, ReadonlySet<string>>
): [string, FormulaRowMapping][] {
  const edges: [string, FormulaRowMapping][] = [];
  const own = formulaIds.get(column.databaseId);
  for (const fieldId of column.sameRowFieldIds) {
    if (own?.has(fieldId)) {
      edges.push([
        formulaColumnKey(column.databaseId, fieldId),
        { kind: "sameRow" },
      ]);
    }
  }
  for (const traversal of column.traversals) {
    if (
      traversal.memberFieldId !== null &&
      formulaIds.get(traversal.targetDatabaseId)?.has(traversal.memberFieldId)
    ) {
      edges.push([
        formulaColumnKey(traversal.targetDatabaseId, traversal.memberFieldId),
        {
          kind: "viaRelation",
          relationFieldId: traversal.relationFieldId,
          sourceDatabaseId: traversal.sourceDatabaseId,
        },
      ]);
    }
  }
  return edges;
}

/** `A.f → B.g → A.f` cycle names: db-qualified when the cycle spans databases. */
function cycleNameOf(
  key: string,
  columns: ReadonlyMap<string, MutableColumnNode>,
  databases: ReadonlyMap<string, FormulaGraphDatabase>,
  crossDatabase: boolean
): string {
  const column = columns.get(key);
  if (column === undefined) {
    return key;
  }
  if (!crossDatabase) {
    return column.fieldName;
  }
  const databaseName = databases.get(column.databaseId)?.name ?? "";
  return databaseName === ""
    ? column.fieldName
    : `${databaseName}.${column.fieldName}`;
}

/**
 * Build the column graph from a schema snapshot of every database. Pure —
 * call again on any schema change (the coarse `formulaSchemaChanged` path).
 */
export function buildFormulaGraph(
  databases: ReadonlyMap<string, FormulaGraphDatabase>
): FormulaGraph {
  const nodes = buildColumns(databases);
  const formulaIds = formulaFieldIdsByDatabase(databases);
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const deps = new Map<string, string[]>();
  const edgesByColumn = new Map<string, [string, FormulaRowMapping][]>();
  for (const node of nodes) {
    const edges = dependencyEdgesOf(node, formulaIds);
    edgesByColumn.set(node.key, edges);
    deps.set(
      node.key,
      edges.map(([depKey]) => depKey)
    );
  }
  for (const node of nodes) {
    const path = formulaCyclePathFrom(node.key, deps);
    if (path !== null) {
      const crossDatabase = path.some(
        (key) => byKey.get(key)?.databaseId !== node.databaseId
      );
      node.cycleError = formulaError(
        formulaCycleMessage(path, (key) =>
          cycleNameOf(key, byKey, databases, crossDatabase)
        )
      );
    }
  }
  const cycleKeys = new Set(
    nodes.filter((node) => node.cycleError !== null).map((node) => node.key)
  );
  const order = formulaTopoOrder(
    nodes,
    (node) => node.key,
    (node) => deps.get(node.key) ?? [],
    cycleKeys
  );
  const dependents = new Map<string, FormulaColumnEdge[]>();
  for (const node of nodes) {
    for (const [depKey, mapping] of edgesByColumn.get(node.key) ?? []) {
      let list = dependents.get(depKey);
      if (list === undefined) {
        list = [];
        dependents.set(depKey, list);
      }
      list.push({ column: node, mapping });
    }
  }
  const columnsByDatabase = new Map<string, FormulaColumnNode[]>();
  for (const node of nodes) {
    let list = columnsByDatabase.get(node.databaseId);
    if (list === undefined) {
      list = [];
      columnsByDatabase.set(node.databaseId, list);
    }
    list.push(node);
  }
  const relationFields = new Map<string, FormulaIndexedRelation>();
  for (const node of nodes) {
    for (const traversal of node.traversals) {
      relationFields.set(traversal.relationFieldId, {
        databaseId: traversal.sourceDatabaseId,
        targetDatabaseId: traversal.targetDatabaseId,
      });
    }
  }
  return {
    columns: byKey,
    columnsByDatabase,
    databases,
    dependents,
    order,
    relationFields,
  };
}
