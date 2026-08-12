/**
 * The incremental evaluator: consumes a dirty map in the graph's global
 * topological order, re-evaluating exactly the dirty (column, row) cells
 * through the same `evaluateFormula` + `createFormulaRowScope` machinery the
 * overlay uses, into a caller-owned value cache.
 *
 * **Equality cutoff**: after re-evaluating a cell, dirtiness propagates to
 * dependent columns only when the recomputed value differs
 * (`formulaValuesEqual`) from the cached one — per-row precision, so an edit
 * that leaves a formula's value unchanged stops the cascade cold. The
 * projected {@link FormulaCellResult} is refreshed for every evaluated cell
 * regardless (row labels can change while the underlying refs stay equal).
 *
 * Cycle columns never evaluate: dirty rows seed their named cycle error into
 * the cache directly, and dependents (which evaluate normally) read and
 * propagate the error value — matching the per-database overlay behavior.
 *
 * Pure: the graph, dirty map, cache, reverse indexes, and rows snapshot are
 * all plain data owned by the caller (P3.3b's engine owns instances); the
 * clock and relation resolver are injected.
 */

import type { FormulaValueDisplayOptions } from "@/lib/formula/display.ts";
import { evaluateFormula } from "@/lib/formula/evaluate.ts";
import {
  createFormulaRowScope,
  formulaRowLabelOf,
} from "@/lib/formula/row-scope.ts";
import {
  type FormulaPreparedUserFunctions,
  type FormulaRelationResolver,
  type FormulaValue,
  formulaValuesEqual,
  isFormulaError,
} from "@/lib/formula/values.ts";
import {
  addFormulaDirtyRows,
  FORMULA_ALL_ROWS,
  type FormulaDirtyMap,
  formulaReferrerRowsForColumn,
} from "@/lib/formula-engine/dirty.ts";
import type {
  FormulaColumnNode,
  FormulaGraph,
} from "@/lib/formula-engine/graph.ts";
import {
  FORMULA_EMPTY_CELL_RESULT,
  type FormulaCellResult,
  formulaCellResultOf,
} from "@/lib/formula-engine/project.ts";
import type { FormulaReverseIndexes } from "@/lib/formula-engine/reverse-index.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

/** One cached formula cell: the runtime value + its cell projection. */
export interface FormulaEngineCell {
  readonly result: FormulaCellResult;
  readonly value: FormulaValue;
}

/** The value cache: databaseId → rowId → fieldId → cell. */
export type FormulaValueCache = Map<
  string,
  Map<string, Map<string, FormulaEngineCell>>
>;

/** Read-only rows accessor the evaluator walks. */
export interface FormulaRowsSnapshot {
  row(databaseId: string, rowId: string): LocalDatabaseRow | undefined;
  rows(databaseId: string): readonly LocalDatabaseRow[];
}

/** A snapshot over a plain per-database rows map (lazy per-db id index). */
export function formulaRowsSnapshotOf(
  rowsByDatabase: ReadonlyMap<string, readonly LocalDatabaseRow[]>
): FormulaRowsSnapshot {
  const byId = new Map<string, Map<string, LocalDatabaseRow>>();
  const indexOf = (databaseId: string) => {
    let index = byId.get(databaseId);
    if (index === undefined) {
      index = new Map(
        (rowsByDatabase.get(databaseId) ?? []).map((row) => [row.id, row])
      );
      byId.set(databaseId, index);
    }
    return index;
  };
  return {
    row: (databaseId, rowId) => indexOf(databaseId).get(rowId),
    rows: (databaseId) => rowsByDatabase.get(databaseId) ?? [],
  };
}

/** Drop one row's cached cells (row removed from its database). */
export function evictFormulaCacheRow(
  cache: FormulaValueCache,
  databaseId: string,
  rowId: string
): void {
  cache.get(databaseId)?.delete(rowId);
}

/** Options for {@link evaluateDirtyFormulas}. */
export interface EvaluateDirtyFormulasOptions {
  /** Injected clock for `now()`/`today()`; omit for the fixed epoch. */
  now?: () => Date;
  /**
   * Instrumentation: called once per (column, row) evaluation — tests
   * assert evaluation COUNTS (dirty precision) instead of wall-clock.
   * Cycle-error seeding does not count as an evaluation.
   */
  onEvaluate?: (databaseId: string, fieldId: string, rowId: string) => void;
  /** Cross-database reader for relation cells and row members. */
  relations?: FormulaRelationResolver;
  /**
   * Named user-defined functions (prepared registry) — must match the
   * registry the graph was built with, or edges and evaluation disagree.
   */
  userFunctions?: FormulaPreparedUserFunctions;
}

/**
 * Cutoff equality: `formulaValuesEqual` (`==` semantics), plus error values
 * comparing by message — re-deriving the same error must not keep the
 * cascade alive (`formulaValuesEqual` compares errors by reference, which is
 * right for `==` but too strict for cutoff).
 */
function cutoffEqual(previous: FormulaValue, next: FormulaValue): boolean {
  if (isFormulaError(previous) && isFormulaError(next)) {
    return previous.message === next.message;
  }
  return formulaValuesEqual(previous, next);
}

function cacheRowOf(
  cache: FormulaValueCache,
  databaseId: string,
  rowId: string
): Map<string, FormulaEngineCell> {
  let databaseCache = cache.get(databaseId);
  if (databaseCache === undefined) {
    databaseCache = new Map();
    cache.set(databaseId, databaseCache);
  }
  let rowCache = databaseCache.get(rowId);
  if (rowCache === undefined) {
    rowCache = new Map();
    databaseCache.set(rowId, rowCache);
  }
  return rowCache;
}

/** Evaluation pass state shared across columns. */
interface EvaluationPass {
  readonly cache: FormulaValueCache;
  /** Per database: its columns' cycle errors, seeding every row's scope. */
  readonly cycleErrorsByDatabase: Map<string, Map<string, FormulaValue>>;
  readonly dirty: FormulaDirtyMap;
  readonly display: FormulaValueDisplayOptions;
  readonly graph: FormulaGraph;
  readonly indexes: FormulaReverseIndexes;
  readonly opts: EvaluateDirtyFormulasOptions | undefined;
  readonly snapshot: FormulaRowsSnapshot;
}

function cycleErrorsOf(
  pass: EvaluationPass,
  databaseId: string
): Map<string, FormulaValue> {
  let errors = pass.cycleErrorsByDatabase.get(databaseId);
  if (errors === undefined) {
    errors = new Map();
    for (const column of pass.graph.columnsByDatabase.get(databaseId) ?? []) {
      if (column.cycleError !== null) {
        errors.set(column.fieldId, column.cycleError);
      }
    }
    pass.cycleErrorsByDatabase.set(databaseId, errors);
  }
  return errors;
}

/**
 * Propagate a changed (column, row) to dependents: same-row edges dirty the
 * same row id in the dependent; via-relation edges map the changed target
 * row to the dependent's referrer rows through the reverse indexes; allRows
 * edges (`db("…")` reads) dirty the dependent's entire column — the coarse
 * whole-database contract.
 */
function propagateChange(
  pass: EvaluationPass,
  column: FormulaColumnNode,
  rowId: string
): void {
  for (const edge of pass.graph.dependents.get(column.key) ?? []) {
    if (edge.mapping.kind === "sameRow") {
      addFormulaDirtyRows(pass.dirty, edge.column.key, [rowId]);
      continue;
    }
    if (edge.mapping.kind === "allRows") {
      addFormulaDirtyRows(pass.dirty, edge.column.key, FORMULA_ALL_ROWS);
      continue;
    }
    const rows = formulaReferrerRowsForColumn(
      edge.column,
      edge.mapping,
      [rowId],
      pass.indexes
    );
    addFormulaDirtyRows(pass.dirty, edge.column.key, rows);
  }
}

/** The dirty rows of a column resolved against the snapshot; missing rows evict. */
function resolveDirtyRows(
  pass: EvaluationPass,
  column: FormulaColumnNode
): LocalDatabaseRow[] {
  const dirtyRows = pass.dirty.get(column.key);
  if (dirtyRows === undefined) {
    return [];
  }
  if (dirtyRows === FORMULA_ALL_ROWS) {
    return [...pass.snapshot.rows(column.databaseId)];
  }
  const rows: LocalDatabaseRow[] = [];
  for (const rowId of dirtyRows) {
    const row = pass.snapshot.row(column.databaseId, rowId);
    if (row === undefined) {
      evictFormulaCacheRow(pass.cache, column.databaseId, rowId);
    } else {
      rows.push(row);
    }
  }
  return rows;
}

/** Seed a cycle column's named error into the cache for its dirty rows. */
function seedCycleColumn(
  pass: EvaluationPass,
  column: FormulaColumnNode
): void {
  const error = column.cycleError;
  if (error === null) {
    return;
  }
  for (const row of resolveDirtyRows(pass, column)) {
    const rowCache = cacheRowOf(pass.cache, column.databaseId, row.id);
    const previous = rowCache.get(column.fieldId);
    if (previous !== undefined && cutoffEqual(previous.value, error)) {
      continue;
    }
    rowCache.set(column.fieldId, {
      result: formulaCellResultOf(error, pass.display),
      value: error,
    });
    propagateChange(pass, column, row.id);
  }
}

/** Already-computed formula values for one row, read from the cache. */
function resolvedValuesFor(
  pass: EvaluationPass,
  column: FormulaColumnNode,
  rowId: string
): Map<string, FormulaValue> {
  const resolved = new Map(cycleErrorsOf(pass, column.databaseId));
  const rowCache = pass.cache.get(column.databaseId)?.get(rowId);
  if (rowCache !== undefined) {
    for (const [fieldId, cell] of rowCache) {
      if (!resolved.has(fieldId)) {
        resolved.set(fieldId, cell.value);
      }
    }
  }
  return resolved;
}

function evaluateColumn(pass: EvaluationPass, column: FormulaColumnNode): void {
  const fields = pass.graph.databases.get(column.databaseId)?.fields ?? [];
  for (const row of resolveDirtyRows(pass, column)) {
    const scope = createFormulaRowScope(
      fields,
      row.values,
      resolvedValuesFor(pass, column, row.id),
      {
        now: pass.opts?.now,
        relations: pass.opts?.relations,
        userFunctions: pass.opts?.userFunctions,
      }
    );
    pass.opts?.onEvaluate?.(column.databaseId, column.fieldId, row.id);
    const value =
      column.ast === null ? null : evaluateFormula(column.ast, scope);
    const rowCache = cacheRowOf(pass.cache, column.databaseId, row.id);
    const previous = rowCache.get(column.fieldId);
    const changed =
      previous === undefined || !cutoffEqual(previous.value, value);
    rowCache.set(column.fieldId, {
      result:
        column.ast === null
          ? FORMULA_EMPTY_CELL_RESULT
          : formulaCellResultOf(value, pass.display),
      value,
    });
    if (changed) {
      propagateChange(pass, column, row.id);
    }
  }
}

/**
 * Evaluate every dirty (column, row) cell into the cache, walking the
 * graph's global topological order so each cell sees its dependencies'
 * fresh values; the dirty map is consumed (cleared). Equality cutoff stops
 * propagation per row; `opts.onEvaluate` observes every real evaluation.
 */
export function evaluateDirtyFormulas(
  graph: FormulaGraph,
  dirty: FormulaDirtyMap,
  cache: FormulaValueCache,
  snapshot: FormulaRowsSnapshot,
  indexes: FormulaReverseIndexes,
  opts?: EvaluateDirtyFormulasOptions
): void {
  const pass: EvaluationPass = {
    cache,
    cycleErrorsByDatabase: new Map(),
    dirty,
    display: { rowLabel: formulaRowLabelOf(opts?.relations) },
    graph,
    indexes,
    opts,
    snapshot,
  };
  // Cycle columns first: their seeded errors dirty dependents, which sit in
  // the topological order below and evaluate afterwards.
  for (const column of graph.columns.values()) {
    if (column.cycleError !== null && dirty.has(column.key)) {
      seedCycleColumn(pass, column);
    }
  }
  for (const column of graph.order) {
    if (dirty.has(column.key)) {
      evaluateColumn(pass, column);
    }
  }
  dirty.clear();
}
