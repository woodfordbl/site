import type { PageFormulaSource } from "@/lib/formula/page-scope.ts";
import { pageFormulaCheckProperties } from "@/lib/formula/page-scope.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";

/**
 * Adapter letting the formula editor — built for a database column — edit an
 * inline prose token instead.
 *
 * The editor asks for a column schema and rows to preview against, because in
 * a database that is what a formula sees. A page has neither, but it does have
 * the base `thisPage` fields, and those map cleanly onto a text/date column
 * list plus a single "row" that is the page itself. That is the whole trick:
 * the editor's reference list, typing, completions, and live preview all work
 * unmodified.
 *
 * Both halves derive from `pageFormulaCheckProperties`, so the fields the
 * editor offers and the fields the scope can actually read cannot drift apart.
 */

/** The synthetic preview row's id — one page, one row. */
export const PAGE_PREVIEW_ROW_ID = "page";

/** Shown in the preview picker when the page has no title yet. */
const UNTITLED_PAGE_LABEL = "This page";

/**
 * Base page fields as editor columns. `kind` is the checker's notion of the
 * field's type, which is exactly the distinction the editor needs.
 */
export function pageFormulaFields(): DatabaseField[] {
  return pageFormulaCheckProperties().map(
    (property) =>
      ({
        id: property.id,
        name: property.name,
        type: property.kind === "date" ? "date" : "text",
      }) as DatabaseField
  );
}

/**
 * The page as the editor's single preview row, so the live preview in the
 * popover evaluates against the real page rather than showing nothing.
 */
export function pageFormulaPreviewRow(page: PageFormulaSource): {
  id: string;
  label: string;
  values: Record<string, DatabaseCellValue>;
} {
  return {
    id: PAGE_PREVIEW_ROW_ID,
    label: page.title.trim() || UNTITLED_PAGE_LABEL,
    values: {
      "page:title": page.title,
      "page:createdAt": page.createdAt,
      "page:updatedAt": page.updatedAt,
    },
  };
}
