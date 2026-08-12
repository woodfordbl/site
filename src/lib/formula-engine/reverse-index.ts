/**
 * Reverse relation indexes for the incremental formula engine: per relation
 * field, `targetRowId → Set<sourceRowId>` — "which rows of the relation's own
 * database link to this target row". Dirty propagation maps a target-row
 * change back to the referrer rows whose formula cells depend on it.
 *
 * Indexes are built from the RAW stored id lists (stale ids included): a
 * target row that doesn't exist yet still gets its referrers recorded, so
 * restoring/creating it can dirty exactly the rows whose refs un-skip.
 * Pure builders + incremental appliers; the maps are plain data owned by the
 * caller.
 */

import type { FormulaGraph } from "@/lib/formula-engine/graph.ts";
import type {
  DatabaseCellValue,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/** One relation field's index: targetRowId → source row ids linking to it. */
export type FormulaReverseIndex = Map<string, Set<string>>;

/** All maintained indexes, keyed by relation field id. */
export type FormulaReverseIndexes = Map<string, FormulaReverseIndex>;

const NO_ROWS: ReadonlySet<string> = new Set();

/** The raw target-row ids stored in a relation cell (empty when not a list). */
export function relationCellTargetIds(
  value: DatabaseCellValue | undefined
): readonly string[] {
  return Array.isArray(value) ? value : [];
}

/** The source rows linking to `targetRowId` through `relationFieldId`. */
export function formulaReferrersOf(
  indexes: FormulaReverseIndexes,
  relationFieldId: string,
  targetRowId: string
): ReadonlySet<string> {
  return indexes.get(relationFieldId)?.get(targetRowId) ?? NO_ROWS;
}

function addLink(
  index: FormulaReverseIndex,
  targetRowId: string,
  sourceRowId: string
): void {
  let sources = index.get(targetRowId);
  if (sources === undefined) {
    sources = new Set();
    index.set(targetRowId, sources);
  }
  sources.add(sourceRowId);
}

function removeLink(
  index: FormulaReverseIndex,
  targetRowId: string,
  sourceRowId: string
): void {
  const sources = index.get(targetRowId);
  if (sources === undefined) {
    return;
  }
  sources.delete(sourceRowId);
  if (sources.size === 0) {
    index.delete(targetRowId);
  }
}

/**
 * Apply a relation cell change to one field's index: old ids drop the source
 * row, new ids gain it. A no-op for relation fields the graph doesn't index
 * (no formula traverses them). Pass `[]` as `newTargetIds` to evict a
 * removed source row's outgoing links.
 */
export function applyFormulaRelationDiff(
  indexes: FormulaReverseIndexes,
  relationFieldId: string,
  sourceRowId: string,
  oldTargetIds: readonly string[],
  newTargetIds: readonly string[]
): void {
  const index = indexes.get(relationFieldId);
  if (index === undefined) {
    return;
  }
  const next = new Set(newTargetIds);
  for (const targetRowId of oldTargetIds) {
    if (!next.has(targetRowId)) {
      removeLink(index, targetRowId, sourceRowId);
    }
  }
  const previous = new Set(oldTargetIds);
  for (const targetRowId of newTargetIds) {
    if (!previous.has(targetRowId)) {
      addLink(index, targetRowId, sourceRowId);
    }
  }
}

/**
 * Build every index the graph needs from a rows snapshot: one index per
 * relation field appearing in any traversal, populated from the owner
 * database's rows. Fields whose owner database has no rows in the snapshot
 * still get an (empty) index so incremental appliers can maintain them.
 */
export function buildFormulaReverseIndexes(
  graph: FormulaGraph,
  rowsOf: (databaseId: string) => readonly LocalDatabaseRow[] | undefined
): FormulaReverseIndexes {
  const indexes: FormulaReverseIndexes = new Map();
  for (const [relationFieldId, relation] of graph.relationFields) {
    const index: FormulaReverseIndex = new Map();
    indexes.set(relationFieldId, index);
    for (const row of rowsOf(relation.databaseId) ?? []) {
      for (const targetRowId of relationCellTargetIds(
        row.values[relationFieldId]
      )) {
        addLink(index, targetRowId, row.id);
      }
    }
  }
  return indexes;
}
