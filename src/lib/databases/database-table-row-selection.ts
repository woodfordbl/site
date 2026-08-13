/**
 * Live table-grid row selection, so canvas Delete/Backspace can prefer
 * selected database rows over deleting the canvas `database` block.
 *
 * @see docs/architecture/databases.md
 */

export interface DatabaseTableRowSelectionSource {
  /** Canvas block row id when this table is embedded; `null` on hub pages. */
  canvasRowId: string | null;
  /** Deletes the grid's selected rows. Returns whether anything was removed. */
  deleteSelectedRows: () => boolean;
  getSelectedRowIds: () => readonly string[];
}

const sources = new Set<DatabaseTableRowSelectionSource>();

/**
 * Registers one mounted table grid's selection. Call the returned disposer
 * on unmount.
 */
export function registerDatabaseTableRowSelection(
  source: DatabaseTableRowSelectionSource
): () => void {
  sources.add(source);
  return () => {
    sources.delete(source);
  };
}

/**
 * Deletes selected rows from tables whose canvas block is in `canvasRowIds`.
 * An empty `canvasRowIds` list matches nothing (a selected non-database
 * block should still delete that block). Returns whether any rows were
 * deleted.
 */
export function tryDeleteSelectedDatabaseTableRows(
  canvasRowIds: readonly string[]
): boolean {
  if (canvasRowIds.length === 0) {
    return false;
  }
  const allowed = new Set(canvasRowIds);
  let deleted = false;
  for (const source of sources) {
    if (source.getSelectedRowIds().length === 0) {
      continue;
    }
    if (source.canvasRowId === null || !allowed.has(source.canvasRowId)) {
      continue;
    }
    if (source.deleteSelectedRows()) {
      deleted = true;
    }
  }
  return deleted;
}
