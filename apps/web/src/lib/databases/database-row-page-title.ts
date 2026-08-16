import { cellToPlainText } from "@/lib/databases/cell-values.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/** Title used when the primary cell is empty (matches the row-page shell). */
export const ROW_PAGE_FALLBACK_TITLE = "Untitled";

/** Plain-text title for a row's page (primary field, or Untitled). */
export function resolveDatabaseRowPageTitle(
  database: LocalDatabase,
  row: LocalDatabaseRow
): string {
  const primaryField = database.fields.find(
    (field) => field.id === database.primaryFieldId
  );
  const title = primaryField
    ? cellToPlainText(primaryField, row.values[primaryField.id]).trim()
    : "";
  return title === "" ? ROW_PAGE_FALLBACK_TITLE : title;
}
