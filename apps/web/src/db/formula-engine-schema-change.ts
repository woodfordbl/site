/**
 * @fileoverview The formula engine's schema-change gate: whether a database
 * record write touched anything a formula can observe.
 *
 * Its own module so `formula-engine.ts` stays inside the repository's
 * file-length cap.
 */
import type { LocalDatabase } from "@/lib/schemas/database.ts";

/** One databases-collection change as the engine sees it. */
export interface EngineDatabaseChange {
  key: string | number;
  type: "delete" | "insert" | "update";
  value?: LocalDatabase;
}

/**
 * Does a database record update change anything a formula can OBSERVE?
 * Formulas read `fields` (schema + expressions), `name` (cycle and member
 * error messages), and `primaryFieldId` (row-ref display labels). View
 * config — filters, sorts, column widths, grouping — lives on the same
 * record but is invisible to the engine, and view edits are FREQUENT
 * (a column drag-resize writes per gesture), so treating every record
 * write as a schema change meant a full graph rebuild plus an all-rows
 * recompute per resize tick. Reference equality first (in-tab writes reuse
 * untouched sub-objects); a structural compare backstops cross-tab syncs,
 * whose JSON round-trip breaks reference identity.
 */
export function databaseSchemaObservablyChanged(
  previous: LocalDatabase | undefined,
  next: LocalDatabase
): boolean {
  if (previous === undefined) {
    return true;
  }
  if (
    previous.name !== next.name ||
    previous.primaryFieldId !== next.primaryFieldId
  ) {
    return true;
  }
  if (previous.fields === next.fields) {
    return false;
  }
  return JSON.stringify(previous.fields) !== JSON.stringify(next.fields);
}

/**
 * Fold a databases-collection burst into the engine's schema mirror, and
 * report which databases changed in a way formulas can observe.
 *
 * The mirror is always brought up to date; the returned set is the narrower
 * question of what needs a graph rebuild, so a view-only write (a column
 * drag-resize writes per gesture) refreshes the mirror and nothing else.
 */
export function applyDatabaseChangesToMirror(
  mirror: Map<string, LocalDatabase>,
  changes: readonly EngineDatabaseChange[]
): Set<string> {
  const changedIds = new Set<string>();
  for (const change of changes) {
    if (change.type === "delete") {
      const databaseId = String(change.key);
      mirror.delete(databaseId);
      changedIds.add(databaseId);
      continue;
    }
    const database = change.value;
    if (database === undefined) {
      continue;
    }
    const previous = mirror.get(database.id);
    mirror.set(database.id, database);
    if (databaseSchemaObservablyChanged(previous, database)) {
      changedIds.add(database.id);
    }
  }
  return changedIds;
}
