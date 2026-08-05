import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowById, flattenRows } from "@/lib/blocks/block-tree.ts";

/**
 * Distinct database ids referenced by `database` blocks inside the rows a
 * canvas delete is about to remove — the rows themselves plus everything
 * nested under them (a selected `columns` container can hold a linked view).
 *
 * A `database` block is a database's only canvas presence, so deleting one
 * deletes the entity; the canvas routes these deletes through a confirmation
 * first. Unlinked blocks (`databaseId: ""`) resolve to nothing and delete
 * silently.
 *
 * @see docs/architecture/databases.md
 */
export function resolveDeletedDatabaseIds(
  rows: CanvasRow[],
  rowIds: readonly string[]
): string[] {
  const databaseIds: string[] = [];
  const seen = new Set<string>();

  for (const rowId of rowIds) {
    const row = findRowById(rows, rowId);
    if (!row) {
      continue;
    }

    for (const nested of flattenRows([row])) {
      const block = nested.effectiveBlock;
      if (block.type !== "database") {
        continue;
      }

      const databaseId = block.props.databaseId;
      if (databaseId === "" || seen.has(databaseId)) {
        continue;
      }

      seen.add(databaseId);
      databaseIds.push(databaseId);
    }
  }

  return databaseIds;
}
