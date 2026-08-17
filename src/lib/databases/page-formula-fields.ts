import {
  computeFormulaRowValues,
  formulaCheckContext,
} from "@/lib/databases/formula-values.ts";
import {
  type FormulaCheckProperty,
  normalizeFormulaPropertyName,
} from "@/lib/formula/check.ts";
import {
  createPageFormulaScope,
  type PageFormulaSource,
  pageFormulaCheckProperties,
} from "@/lib/formula/page-scope.ts";
import {
  type CreateFormulaRowScopeOptions,
  createFormulaRowScope,
} from "@/lib/formula/row-scope.ts";
import type {
  FormulaPreparedUserFunctions,
  FormulaScope,
} from "@/lib/formula/values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  LocalDatabase,
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
 * On database **row** and **template** pages the same adapter layers the
 * database's fields over the base three: name collisions favor the database
 * field (`thisPage.Title` reads the column), while base ids stay reachable
 * (`prop("page:title")`). Editor fields, checker properties, and the eval
 * scope all derive from the same merge so they cannot drift.
 */

/** The synthetic preview row's id — one page, one row. */
export const PAGE_PREVIEW_ROW_ID = "page";

/** Shown in the preview picker when the page has no title yet. */
const UNTITLED_PAGE_LABEL = "This page";

/** Database fields + cell values layered onto a page's `thisPage` scope. */
export interface InlinePageFormulaOverlay {
  readonly fields: readonly DatabaseField[];
  readonly values: Record<string, DatabaseCellValue>;
}

/**
 * Live `thisPage` model for inline formula tokens on the current canvas.
 * Ordinary pages carry only {@link page}; row/template pages fill
 * {@link databaseFields} / {@link cellValues}. `thisRow` is a scope root
 * only when {@link databaseFields} is non-empty — see
 * {@link pageHasFormulaRowContext}.
 */
export interface InlineFormulaPageModel {
  /**
   * Cell values for {@link databaseFields}: the open row's values, or the
   * database's row defaults when editing the template.
   */
  readonly cellValues: Record<string, DatabaseCellValue>;
  /** Database columns layered onto `thisPage`; empty on ordinary pages. */
  readonly databaseFields: readonly DatabaseField[];
  /** Base page title / timestamps every page exposes. */
  readonly page: PageFormulaSource;
  /**
   * The database's primary column. It holds the same value the page title
   * does, so {@link pageFormulaFields} lists `Title` instead of both.
   */
  readonly primaryFieldId?: string;
}

/**
 * Whether `thisRow` is a scope-root synonym of `thisPage` for this page.
 * True on database row pages and row-template pages (they layer database
 * fields). False on ordinary pages, where `thisRow` is a bare name.
 * Formula columns / filters do not use this helper — they always have a
 * row and default `thisRowInScope` to true.
 */
export function pageHasFormulaRowContext(
  model: Pick<InlineFormulaPageModel, "databaseFields"> | null | undefined
): boolean {
  return (model?.databaseFields.length ?? 0) > 0;
}

/** Base page fields as editor columns (no database overlay). */
function basePageFormulaFields(): DatabaseField[] {
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
 * Fields the formula editor's Properties list shows for an inline token.
 *
 * Ordering is base-page fields (Title, Created at, Updated at) first, then the
 * database's own columns — the defaults are what most prose tokens reach for,
 * so they lead.
 *
 * The database's PRIMARY column is dropped: a row page's title IS its primary
 * cell (`resolveDatabaseRowPageTitle`), so listing both offered two names for
 * one value. `Title` is the surviving spelling. The primary column stays
 * resolvable in the checker and scope, so formulas that already say
 * `thisPage.Name` keep working — it just is not offered twice.
 *
 * A non-primary column whose display name collides with a base field still
 * shadows it (the scope resolves that name to the column), so the base field
 * drops out of the list; it remains reachable as `prop("page:…")`.
 */
export function pageFormulaFields(
  overlayFields?: readonly DatabaseField[],
  primaryFieldId?: string
): DatabaseField[] {
  const base = basePageFormulaFields();
  if (overlayFields === undefined || overlayFields.length === 0) {
    return base;
  }
  const listed = overlayFields.filter((field) => field.id !== primaryFieldId);
  const taken = new Set(
    listed.map((field) => normalizeFormulaPropertyName(field.name))
  );
  return [
    ...base.filter(
      (field) => !taken.has(normalizeFormulaPropertyName(field.name))
    ),
    ...listed,
  ];
}

/**
 * Checker properties for inline tokens: database fields first (so name
 * collisions favor the column), then every base page field (ids stay
 * distinct via the `page:` prefix).
 */
export function inlinePageFormulaCheckProperties(
  overlayFields?: readonly DatabaseField[],
  relatedDatabases?: readonly Pick<LocalDatabase, "fields" | "id" | "name">[],
  userFunctions?: FormulaPreparedUserFunctions
): FormulaCheckProperty[] {
  const base = pageFormulaCheckProperties();
  if (overlayFields === undefined || overlayFields.length === 0) {
    return base;
  }
  const database = formulaCheckContext(
    overlayFields,
    relatedDatabases,
    userFunctions
  );
  return [...database.properties, ...base];
}

/**
 * The page as the editor's single preview row, so the live preview in the
 * popover evaluates against the real page (and, on row/template pages, the
 * row's cell values or template defaults) rather than showing nothing.
 */
export function pageFormulaPreviewRow(
  page: PageFormulaSource,
  cellValues?: Record<string, DatabaseCellValue>
): {
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
      ...cellValues,
    },
  };
}

/**
 * Eval scope for inline prose tokens: base page fields, optionally layered
 * with a database row (or template defaults). Database fields win name
 * collisions; base fields remain readable by canonical `page:…` id.
 */
export function createInlinePageFormulaScope(
  page: PageFormulaSource,
  overlay?: InlinePageFormulaOverlay | null,
  opts?: CreateFormulaRowScopeOptions
): FormulaScope {
  const base = createPageFormulaScope(page, opts);
  if (
    overlay === undefined ||
    overlay === null ||
    overlay.fields.length === 0
  ) {
    return base;
  }

  const resolved = computeFormulaRowValues(
    overlay.fields,
    overlay.values,
    opts
  );
  const row = createFormulaRowScope(
    overlay.fields,
    overlay.values,
    resolved,
    opts
  );

  const fieldIds = new Set(overlay.fields.map((field) => field.id));
  const fieldNames = new Set(
    overlay.fields.map((field) => normalizeFormulaPropertyName(field.name))
  );

  const scope: FormulaScope = {
    getProperty: (name) => {
      if (
        fieldIds.has(name) ||
        fieldNames.has(normalizeFormulaPropertyName(name))
      ) {
        return row.getProperty(name);
      }
      return base.getProperty(name);
    },
  };
  if (opts?.now !== undefined) {
    scope.now = opts.now;
  }
  if (opts?.relations !== undefined) {
    scope.relations = opts.relations;
  }
  if (opts?.userFunctions !== undefined) {
    scope.userFunctions = opts.userFunctions;
  }
  return scope;
}
