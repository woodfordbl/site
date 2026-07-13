/**
 * Row-granular dirty propagation for the incremental formula engine: maps an
 * input event (cell edit, relation edit, row add/remove, schema change,
 * clock tick) to per-column dirty ROW sets. Pure functions mutating a
 * caller-owned dirty map — evaluation (`evaluate-dirty.ts`) consumes the map
 * in topological order.
 *
 * "All rows" is the explicit sentinel {@link FORMULA_ALL_ROWS} (`"all"`),
 * used by coarse events (schema change, clock tick, full recompute): a
 * column marked `"all"` re-evaluates every row in the snapshot, and further
 * row-level marks are absorbed by it.
 *
 * Via-relation mapping composes across chained hops: a change in database C
 * reaches a column of database A whose traversal chain runs A→B→C by mapping
 * C-rows → B-rows through the second hop's reverse index, then B-rows →
 * A-rows through the first hop's ({@link formulaReferrerRowsForColumn}).
 *
 * `db("…")` references are the deliberately COARSE hop (proposal §4.4
 * tier 3): with no relation field there is no reverse index, so any change
 * in the referenced database — including one reached through a downstream
 * relation chain (`db("B").map(b => b.RelC…)`) — dirties every row of the
 * referencing column ({@link FORMULA_ALL_ROWS}). Member precision still
 * applies: a member-named db ref ignores changes to other target fields.
 */

import type {
  FormulaColumnNode,
  FormulaGraph,
} from "@/lib/formula-engine/graph.ts";
import {
  applyFormulaRelationDiff,
  type FormulaReverseIndexes,
  formulaReferrersOf,
  relationCellTargetIds,
} from "@/lib/formula-engine/reverse-index.ts";
import type { DatabaseCellValue } from "@/lib/schemas/database.ts";

/** Explicit "every row of the column's database" sentinel. */
export const FORMULA_ALL_ROWS = "all";

/** A column's dirty rows: a row-id set, or every row. */
export type FormulaDirtyRows = Set<string> | typeof FORMULA_ALL_ROWS;

/** Dirty state: column key (`databaseId:fieldId`) → dirty rows. */
export type FormulaDirtyMap = Map<string, FormulaDirtyRows>;

/** Mark rows dirty for a column; `"all"` absorbs row-level marks. */
export function addFormulaDirtyRows(
  dirty: FormulaDirtyMap,
  columnKey: string,
  rows: Iterable<string> | typeof FORMULA_ALL_ROWS
): void {
  const existing = dirty.get(columnKey);
  if (existing === FORMULA_ALL_ROWS) {
    return;
  }
  if (rows === FORMULA_ALL_ROWS) {
    dirty.set(columnKey, FORMULA_ALL_ROWS);
    return;
  }
  const set = existing ?? new Set<string>();
  for (const rowId of rows) {
    set.add(rowId);
  }
  if (set.size > 0) {
    dirty.set(columnKey, set);
  }
}

/** The not-yet-processed rows of `current`, marking them processed. */
function unprocessedRows(
  processed: Map<string, Set<string>>,
  databaseId: string,
  current: ReadonlySet<string>
): string[] {
  let seen = processed.get(databaseId);
  if (seen === undefined) {
    seen = new Set();
    processed.set(databaseId, seen);
  }
  const fresh: string[] = [];
  for (const rowId of current) {
    if (!seen.has(rowId)) {
      seen.add(rowId);
      fresh.push(rowId);
    }
  }
  return fresh;
}

/** Referrer rows of `rowIds` through one traversal's reverse index. */
function referrersThroughTraversal(
  indexes: FormulaReverseIndexes,
  relationFieldId: string,
  rowIds: readonly string[]
): Set<string> {
  const mapped = new Set<string>();
  for (const rowId of rowIds) {
    for (const sourceRowId of formulaReferrersOf(
      indexes,
      relationFieldId,
      rowId
    )) {
      mapped.add(sourceRowId);
    }
  }
  return mapped;
}

/**
 * Map rows of `fromDatabaseId` to the column's own rows by walking the
 * column's traversal chain backwards through the reverse indexes (chained
 * hops compose; a worklist per database handles diamonds, and per-database
 * processed sets bound cyclic relation structures). A database the column
 * references WHOLE (`db("…")`) short-circuits to {@link FORMULA_ALL_ROWS}:
 * there is no relation hop to map its rows back through, so a change there
 * coarsely dirties the entire column.
 */
function mapSourceRowsToColumn(
  column: FormulaColumnNode,
  fromDatabaseId: string,
  rows: ReadonlySet<string>,
  indexes: FormulaReverseIndexes
): FormulaDirtyRows {
  const result = new Set<string>();
  const processed = new Map<string, Set<string>>();
  const queue: [string, ReadonlySet<string>][] = [[fromDatabaseId, rows]];
  while (queue.length > 0) {
    const [databaseId, current] = queue.shift() as [
      string,
      ReadonlySet<string>,
    ];
    const fresh = unprocessedRows(processed, databaseId, current);
    if (fresh.length === 0) {
      continue;
    }
    if (databaseId === column.databaseId) {
      for (const rowId of fresh) {
        result.add(rowId);
      }
      continue;
    }
    if (
      column.databaseRefs.some(
        (reference) => reference.targetDatabaseId === databaseId
      )
    ) {
      return FORMULA_ALL_ROWS;
    }
    for (const traversal of column.traversals) {
      if (traversal.targetDatabaseId !== databaseId) {
        continue;
      }
      const mapped = referrersThroughTraversal(
        indexes,
        traversal.relationFieldId,
        fresh
      );
      if (mapped.size > 0) {
        queue.push([traversal.sourceDatabaseId, mapped]);
      }
    }
  }
  return result;
}

/**
 * The column's own rows affected by a change to `targetRowIds` reached
 * through one traversal hop: map through the hop's reverse index, then
 * compose the remaining chain back to the column's database (which may
 * coarsen to {@link FORMULA_ALL_ROWS} when the chain crosses a `db("…")`
 * reference).
 */
export function formulaReferrerRowsForColumn(
  column: FormulaColumnNode,
  hop: { relationFieldId: string; sourceDatabaseId: string },
  targetRowIds: Iterable<string>,
  indexes: FormulaReverseIndexes
): FormulaDirtyRows {
  const sourceRows = new Set<string>();
  for (const targetRowId of targetRowIds) {
    for (const sourceRowId of formulaReferrersOf(
      indexes,
      hop.relationFieldId,
      targetRowId
    )) {
      sourceRows.add(sourceRowId);
    }
  }
  return mapSourceRowsToColumn(
    column,
    hop.sourceDatabaseId,
    sourceRows,
    indexes
  );
}

/** `null` members match anything — the same rule on both event and reference. */
function memberFieldMatches(
  referenceMember: string | null,
  eventMember: string | null
): boolean {
  return (
    referenceMember === null ||
    eventMember === null ||
    referenceMember === eventMember
  );
}

/**
 * Dirty every column reading `databaseId` from elsewhere: traversing columns
 * map the changed row to referrer rows through the reverse indexes; columns
 * referencing the database WHOLE (`db("…")`) dirty all rows — the coarse
 * contract — when the member matches.
 */
function dirtyTraversalReferrers(
  graph: FormulaGraph,
  indexes: FormulaReverseIndexes,
  dirty: FormulaDirtyMap,
  databaseId: string,
  rowId: string,
  memberFieldId: string | null
): void {
  for (const column of graph.columns.values()) {
    for (const traversal of column.traversals) {
      const memberMatches = memberFieldMatches(
        traversal.memberFieldId,
        memberFieldId
      );
      if (traversal.targetDatabaseId !== databaseId || !memberMatches) {
        continue;
      }
      const rows = formulaReferrerRowsForColumn(
        column,
        traversal,
        [rowId],
        indexes
      );
      addFormulaDirtyRows(dirty, column.key, rows);
    }
    for (const reference of column.databaseRefs) {
      if (
        reference.targetDatabaseId === databaseId &&
        memberFieldMatches(reference.memberFieldId, memberFieldId)
      ) {
        addFormulaDirtyRows(dirty, column.key, FORMULA_ALL_ROWS);
      }
    }
  }
}

/** One data-cell edit event. */
export interface FormulaCellChangeEvent {
  readonly databaseId: string;
  readonly fieldId: string;
  readonly rowId: string;
}

/**
 * A non-relation data cell changed: same-database columns referencing the
 * field dirty that row; columns anywhere traversing into this database with
 * a matching (or null) member dirty their referrer rows via the reverse
 * indexes.
 */
export function formulaDataCellChanged(
  graph: FormulaGraph,
  indexes: FormulaReverseIndexes,
  dirty: FormulaDirtyMap,
  event: FormulaCellChangeEvent
): void {
  for (const column of graph.columnsByDatabase.get(event.databaseId) ?? []) {
    if (column.sameRowFieldIds.has(event.fieldId)) {
      addFormulaDirtyRows(dirty, column.key, [event.rowId]);
    }
  }
  dirtyTraversalReferrers(
    graph,
    indexes,
    dirty,
    event.databaseId,
    event.rowId,
    event.fieldId
  );
}

/** One relation-cell edit event (old → new target id lists). */
export interface FormulaRelationChangeEvent extends FormulaCellChangeEvent {
  readonly newTargetIds: readonly string[];
  readonly oldTargetIds: readonly string[];
}

/**
 * A relation cell changed: the reverse index updates first (so subsequent
 * mappings see the new links), then the change dirties like a data cell —
 * same-row columns referencing the relation field, plus columns elsewhere
 * traversing into this database through it.
 */
export function formulaRelationCellChanged(
  graph: FormulaGraph,
  indexes: FormulaReverseIndexes,
  dirty: FormulaDirtyMap,
  event: FormulaRelationChangeEvent
): void {
  applyFormulaRelationDiff(
    indexes,
    event.fieldId,
    event.rowId,
    event.oldTargetIds,
    event.newTargetIds
  );
  formulaDataCellChanged(graph, indexes, dirty, event);
}

/** One row lifecycle event; `values` is the row's cell values. */
export interface FormulaRowEvent {
  readonly databaseId: string;
  readonly rowId: string;
  readonly values: Readonly<Record<string, DatabaseCellValue>>;
}

/** Register the row's outgoing links in the maintained indexes. */
function indexRowLinks(
  graph: FormulaGraph,
  indexes: FormulaReverseIndexes,
  event: FormulaRowEvent,
  direction: "add" | "remove"
): void {
  for (const field of graph.databases.get(event.databaseId)?.fields ?? []) {
    if (field.type !== "relation") {
      continue;
    }
    const targetIds = relationCellTargetIds(event.values[field.id]);
    if (targetIds.length === 0) {
      continue;
    }
    if (direction === "add") {
      applyFormulaRelationDiff(indexes, field.id, event.rowId, [], targetIds);
    } else {
      applyFormulaRelationDiff(indexes, field.id, event.rowId, targetIds, []);
    }
  }
}

/**
 * A row appeared: every formula column of its database dirties that row, its
 * outgoing relation links enter the indexes, and referrers pointing at it
 * dirty too — stored refs to this id stop being skipped (stale-id
 * semantics), so rollups over it change.
 */
export function formulaRowAdded(
  graph: FormulaGraph,
  indexes: FormulaReverseIndexes,
  dirty: FormulaDirtyMap,
  event: FormulaRowEvent
): void {
  indexRowLinks(graph, indexes, event, "add");
  for (const column of graph.columnsByDatabase.get(event.databaseId) ?? []) {
    addFormulaDirtyRows(dirty, column.key, [event.rowId]);
  }
  dirtyTraversalReferrers(
    graph,
    indexes,
    dirty,
    event.databaseId,
    event.rowId,
    null
  );
}

/**
 * A row disappeared: referrers dirty (their refs to this id now skip —
 * stale-id semantics), and the row's outgoing links leave the indexes.
 * Entries where the removed row is a TARGET stay — stored cells still hold
 * the stale id, and the index mirrors stored cells so a restore can find
 * the referrers again. The caller evicts the row's value-cache entries
 * (`evictFormulaCacheRow`).
 */
export function formulaRowRemoved(
  graph: FormulaGraph,
  indexes: FormulaReverseIndexes,
  dirty: FormulaDirtyMap,
  event: FormulaRowEvent
): void {
  dirtyTraversalReferrers(
    graph,
    indexes,
    dirty,
    event.databaseId,
    event.rowId,
    null
  );
  indexRowLinks(graph, indexes, event, "remove");
}

/**
 * A database's schema changed — the coarse path: the caller has already
 * REBUILT the graph (and reverse indexes); every formula column of the
 * changed database and every column reading into it (traversals and
 * `db("…")` references alike) re-evaluates fully (the
 * {@link FORMULA_ALL_ROWS} sentinel).
 */
export function formulaSchemaChanged(
  graph: FormulaGraph,
  dirty: FormulaDirtyMap,
  databaseId: string
): void {
  for (const column of graph.columns.values()) {
    const reads =
      column.traversals.some(
        (traversal) => traversal.targetDatabaseId === databaseId
      ) ||
      column.databaseRefs.some(
        (reference) => reference.targetDatabaseId === databaseId
      );
    if (column.databaseId === databaseId || reads) {
      addFormulaDirtyRows(dirty, column.key, FORMULA_ALL_ROWS);
    }
  }
}

/** The 60s clock tick: every volatile column re-evaluates fully. */
export function formulaClockTick(
  graph: FormulaGraph,
  dirty: FormulaDirtyMap
): void {
  for (const column of graph.columns.values()) {
    if (column.volatile) {
      addFormulaDirtyRows(dirty, column.key, FORMULA_ALL_ROWS);
    }
  }
}
