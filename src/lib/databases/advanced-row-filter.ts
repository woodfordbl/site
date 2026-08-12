import type { FormulaOverlay } from "@/lib/databases/formula-values.ts";
import { evaluateFormula, isVolatileFormula } from "@/lib/formula/evaluate.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import {
  createFormulaRowScope,
  type ResolvedFormulaValues,
} from "@/lib/formula/row-scope.ts";
import type {
  FormulaPreparedUserFunctions,
  FormulaRelationResolver,
  FormulaValue,
} from "@/lib/formula/values.ts";
import { formulaError } from "@/lib/formula/values.ts";
import type { FormulaCellResult } from "@/lib/formula-engine/project.ts";
import type {
  DatabaseAdvancedFilter,
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Advanced view filter: ONE arbitrary formula evaluated per row; rows where
 * it yields exactly `true` stay visible. Runs at VIEW time like the
 * structured filter (`row-filter.ts`) — never through the engine's column
 * graph — over whatever row set the structured filter left.
 *
 * Pass contract (documented on `databaseAdvancedFilterSchema` too):
 * - A row passes only when the expression evaluates to strict boolean
 *   `true`. Errors, blank, numbers, strings — anything else — hide the row
 *   (fail closed), matching Notion's behavior.
 * - A BLANK or UNPARSEABLE expression disables the filter entirely: every
 *   row stays visible. Unparseable saved text is a broken-chip UI state
 *   (`database-advanced-filter-chip.tsx`), not a hide-everything trap.
 *
 * The expression parses ONCE per call; only evaluation runs per row.
 * Formula-field references resolve from the caller's OVERLAY — the engine's
 * already-computed results — never by re-evaluating the column (see
 * {@link overlayResolvedValues} for the projection this implies).
 */

/** Everything {@link applyAdvancedFilter} evaluates against. */
export interface AdvancedRowFilterContext {
  /** Full schema of the filtered database (property references). */
  fields: readonly DatabaseField[];
  /** Injected clock for `now()`/`today()`; omit for real time. */
  now?: () => Date;
  /**
   * Engine-computed formula results (the same overlay merged into the rows).
   * Absent, formula-field references read as blank.
   */
  overlay?: FormulaOverlay;
  /** Cross-database reader for relation rollups and `db()` references. */
  relations?: FormulaRelationResolver;
  /** Named user-defined functions (prepared registry). */
  userFunctions?: FormulaPreparedUserFunctions;
}

/**
 * Everything `formulaValueToDisplay` prefixes evaluation-error text with —
 * stripped when decoding an overlay error back into a `FormulaError` so the
 * message doesn't double-prefix if it ever re-displays.
 */
const ERROR_DISPLAY_PREFIX = "⚠ ";

/**
 * One overlay cell back into the formula value domain. The overlay stores
 * PROJECTED results (`FormulaCellResult` — the cell-value shapes the grid
 * pipeline reads), so this is the projection's inverse where one exists:
 * scalars pass through, lists come back as text lists, errors come back as
 * `FormulaError` values (so references into a broken formula propagate the
 * error and fail closed). Dates and row refs already projected to display
 * strings — an accepted limit of overlay-sourced reads: compare them as
 * text, or reference the source columns directly for typed comparisons.
 */
function overlayCellToFormulaValue(result: FormulaCellResult): FormulaValue {
  if (result.isError) {
    const message = result.display.startsWith(ERROR_DISPLAY_PREFIX)
      ? result.display.slice(ERROR_DISPLAY_PREFIX.length)
      : result.display;
    return formulaError(message);
  }
  const cell = result.cellValue;
  if (Array.isArray(cell)) {
    return cell.map((item): FormulaValue => item);
  }
  return cell;
}

/** One row's overlay entry as the scope's `resolved` map (see module docs). */
function overlayResolvedValues(
  entry: Record<string, FormulaCellResult> | undefined
): ResolvedFormulaValues | undefined {
  if (entry === undefined) {
    return;
  }
  const resolved = new Map<string, FormulaValue>();
  for (const [fieldId, result] of Object.entries(entry)) {
    resolved.set(fieldId, overlayCellToFormulaValue(result));
  }
  return resolved;
}

/**
 * Whether an advanced filter's expression depends on the clock
 * (`now()`/`today()` — `isVolatileFormula`, user-function bodies expanded).
 * The table view keeps its display clock ticking while true, so the filter
 * re-runs each minute like relative-window structured filters do. Blank and
 * unparseable expressions are never volatile (they never filter).
 */
export function advancedFilterIsVolatile(
  advancedFilter: DatabaseAdvancedFilter | undefined,
  userFunctions?: FormulaPreparedUserFunctions
): boolean {
  const expression = advancedFilter?.expression ?? "";
  if (expression.trim() === "") {
    return false;
  }
  const parsed = parseFormula(expression);
  return parsed.ok && isVolatileFormula(parsed.ast, userFunctions);
}

/**
 * Apply a view's advanced filter to a row set (see the module docs for the
 * full pass contract). No filter, a blank expression, or an unparseable one
 * returns the input unchanged; otherwise the parsed expression evaluates
 * once per row through the same scope machinery formulas use, and only rows
 * yielding exactly `true` survive. Volatile expressions (`now()`/`today()`)
 * evaluate against `context.now` — callers with one must re-run on their
 * clock tick (the table view's display clock does).
 */
export function applyAdvancedFilter(
  rows: readonly LocalDatabaseRow[],
  advancedFilter: DatabaseAdvancedFilter | undefined,
  context: AdvancedRowFilterContext
): LocalDatabaseRow[] {
  const expression = advancedFilter?.expression ?? "";
  if (expression.trim() === "") {
    return [...rows];
  }
  const parsed = parseFormula(expression);
  if (!parsed.ok) {
    return [...rows];
  }
  const scopeOptions = {
    now: context.now,
    relations: context.relations,
    userFunctions: context.userFunctions,
  };
  return rows.filter((row) => {
    const scope = createFormulaRowScope(
      context.fields,
      row.values,
      overlayResolvedValues(context.overlay?.get(row.id)),
      scopeOptions
    );
    return evaluateFormula(parsed.ast, scope) === true;
  });
}
