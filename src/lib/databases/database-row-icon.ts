import { readRowTemplateSnapshot } from "@/lib/databases/row-template-store.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

/**
 * Icon shown for a database row in the grid and on its page: per-row override,
 * else the row-template default, else undefined (UI falls back to
 * {@link DEFAULT_PAGE_ICON} / the same document glyph as ordinary pages).
 */
export function resolveDatabaseRowIcon(
  row: Pick<LocalDatabaseRow, "databaseId" | "icon">,
  templateIcon?: string
): string | undefined {
  if (row.icon) {
    return row.icon;
  }
  if (templateIcon) {
    return templateIcon;
  }
  return readRowTemplateSnapshot(row.databaseId)?.icon;
}
