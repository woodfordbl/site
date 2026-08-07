/**
 * Sidebar page-list DnD encoding for hosted-database rows. Shares the page
 * list {@link DndSurface} channel; source ids are prefixed so they never
 * collide with page ids.
 */

export const DATABASE_LIST_DRAG_PREFIX = "database:" as const;

/** Builds the drag-source id written into the page-list DnD channel. */
export function databaseListDragSourceId(databaseId: string): string {
  return `${DATABASE_LIST_DRAG_PREFIX}${databaseId}`;
}

/** Reads a database id from a page-list drag source, or `null` when it is a page. */
export function parseDatabaseListDragSourceId(sourceId: string): string | null {
  if (!sourceId.startsWith(DATABASE_LIST_DRAG_PREFIX)) {
    return null;
  }
  const databaseId = sourceId.slice(DATABASE_LIST_DRAG_PREFIX.length);
  return databaseId.length > 0 ? databaseId : null;
}
