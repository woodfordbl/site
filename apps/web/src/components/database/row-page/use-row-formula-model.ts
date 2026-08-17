import { useMemo } from "react";

import { resolveDatabaseRowPageTitle } from "@/lib/databases/database-row-page-title.ts";
import type { InlineFormulaPageModel } from "@/lib/databases/page-formula-fields.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * The `thisPage` scope for a row rendered through the shared template — the
 * template editor's Live Preview and a row page that has not been customized.
 *
 * Both surfaces show one row's values against template blocks, and both need
 * the same scope for it: `{{ thisPage.Place }}` tokens print from it, and a
 * `map` block bound to a location property resolves its point through it at
 * render time rather than at instantiation.
 */
export function useRowFormulaModel(
  database: LocalDatabase,
  row: LocalDatabaseRow
): InlineFormulaPageModel {
  const title = resolveDatabaseRowPageTitle(database, row);

  return useMemo(
    () => ({
      cellValues: row.values,
      databaseFields: database.fields,
      page: {
        createdAt: row.createdAt,
        title,
        updatedAt: row.updatedAt,
      },
      primaryFieldId: database.primaryFieldId,
    }),
    [
      database.fields,
      database.primaryFieldId,
      row.createdAt,
      row.updatedAt,
      row.values,
      title,
    ]
  );
}
