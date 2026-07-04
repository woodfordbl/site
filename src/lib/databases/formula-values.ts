import {
  type ExprValue,
  evaluateExpression,
  isExprError,
  isVolatileExpression,
} from "@/lib/expr/evaluate.ts";
import {
  exprValueToCellValue,
  exprValueToDisplay,
} from "@/lib/expr/format-result.ts";
import {
  type ExprNode,
  type ParseExpressionResult,
  parseExpression,
} from "@/lib/expr/parse.ts";
import { createRowScope } from "@/lib/expr/row-scope.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Read-time formula computation as a pure overlay: formula fields never store
 * values in `row.values` — this module evaluates them per row and merges the
 * results into COPIES of the rows (`withFormulaValues`) so the existing
 * filter/sort/aggregate/grid machinery sees formula columns like any other
 * column. Nothing here is ever persisted.
 */

/** One computed formula cell. */
export interface FormulaCellResult {
  /**
   * The result projected into the cell-value domain
   * (`exprValueToCellValue`): evaluation errors and non-finite numbers
   * collapse to `null` so filters/sorts/aggregates treat them as empty.
   */
  cellValue: DatabaseCellValue;
  /** Human display string (`exprValueToDisplay`); errors read "⚠ …". */
  display: string;
  /** Whether evaluation produced an `ExprError` for this cell. */
  isError: boolean;
}

/** Computed formula values: rowId → fieldId → result. */
export type FormulaOverlay = Map<string, Record<string, FormulaCellResult>>;

/** Options for {@link computeFormulaOverlay}. */
export interface ComputeFormulaOverlayOptions {
  /** Injected clock for `now()`/`today()`; omit for the fixed epoch. */
  now?: () => Date;
}

/** Shared result for cells with no computable value (blank/parse-error). */
const EMPTY_RESULT: FormulaCellResult = {
  cellValue: null,
  display: "",
  isError: false,
};

function resultOf(value: ExprValue): FormulaCellResult {
  if (isExprError(value)) {
    return {
      cellValue: null,
      display: exprValueToDisplay(value),
      isError: true,
    };
  }
  return {
    cellValue: exprValueToCellValue(value),
    display: exprValueToDisplay(value),
    isError: false,
  };
}

/**
 * Parse a formula field's expression, caching by expression string. Blank
 * expressions and parse failures return `null` (no AST) — the overlay maps
 * those fields to null cells and the display layer surfaces the parse error
 * separately (`formulaDisplayInfo`).
 */
function astFor(
  cache: Map<string, ParseExpressionResult>,
  expression: string
): ExprNode | null {
  if (expression.trim() === "") {
    return null;
  }
  let parsed = cache.get(expression);
  if (!parsed) {
    parsed = parseExpression(expression);
    cache.set(expression, parsed);
  }
  return parsed.ok ? parsed.ast : null;
}

/**
 * Evaluate every formula field over every row. Each expression parses once
 * per call (cached by expression string); each row builds one shared
 * `createRowScope`. Blank and parse-error expressions yield null cells for
 * every row — including rows with stale stored values under the field id
 * (e.g. after a type change), which the overlay deliberately shadows.
 */
export function computeFormulaOverlay(
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  opts?: ComputeFormulaOverlayOptions
): FormulaOverlay {
  const overlay: FormulaOverlay = new Map();
  const parseCache = new Map<string, ParseExpressionResult>();
  const formulaFields: { fieldId: string; ast: ExprNode | null }[] = [];
  for (const field of fields) {
    if (field.type === "formula") {
      formulaFields.push({
        fieldId: field.id,
        ast: astFor(parseCache, field.expression),
      });
    }
  }
  if (formulaFields.length === 0) {
    return overlay;
  }

  const scopeFields = [...fields];
  const now = opts?.now;
  for (const row of rows) {
    const scope = createRowScope(
      scopeFields,
      row.values,
      now === undefined ? undefined : { now }
    );
    const entry: Record<string, FormulaCellResult> = {};
    for (const { fieldId, ast } of formulaFields) {
      entry[fieldId] =
        ast === null ? EMPTY_RESULT : resultOf(evaluateExpression(ast, scope));
    }
    overlay.set(row.id, entry);
  }
  return overlay;
}

/**
 * Display prefix every evaluation-error marker starts with (matches
 * `exprValueToDisplay`'s error rendering).
 */
const ERROR_DISPLAY_PREFIX = "⚠ ";

/**
 * In-memory marker carrying an evaluation error's display string through
 * `row.values` (a single-element string array — a shape no scalar formula
 * result uses). `coerceCellValue` reads formula-cell arrays as empty, so the
 * marker is invisible to filters/sorts/aggregates; only the grid's formula
 * cell renderer decodes it via {@link formulaCellErrorDisplay}. Merged rows
 * are ephemeral render inputs — markers are never persisted.
 */
function encodeMergedCell(result: FormulaCellResult): DatabaseCellValue {
  return result.isError ? [result.display] : result.cellValue;
}

/**
 * The "⚠ …" display string when a merged formula cell holds an evaluation
 * error marker, `null` for every real value shape.
 */
export function formulaCellErrorDisplay(
  value: DatabaseCellValue | undefined
): string | null {
  if (
    Array.isArray(value) &&
    value.length === 1 &&
    value[0].startsWith(ERROR_DISPLAY_PREFIX)
  ) {
    return value[0];
  }
  return null;
}

/**
 * Rows with computed formula values merged into `values` — new row/values
 * objects, inputs never mutated; rows without an overlay entry pass through
 * by identity. Error cells carry the display marker (see
 * {@link formulaCellErrorDisplay}). Feed the merged rows to
 * filter/sort/aggregate AND the grid so formulas ride the whole view
 * pipeline.
 */
export function withFormulaValues(
  rows: readonly LocalDatabaseRow[],
  overlay: FormulaOverlay
): LocalDatabaseRow[] {
  if (overlay.size === 0) {
    return [...rows];
  }
  return rows.map((row) => {
    const entry = overlay.get(row.id);
    if (!entry) {
      return row;
    }
    const values = { ...row.values };
    for (const [fieldId, result] of Object.entries(entry)) {
      values[fieldId] = encodeMergedCell(result);
    }
    return { ...row, values };
  });
}

/**
 * Parse status for header/menu error badges. Non-formula fields and blank
 * expressions report no error (a blank formula is "not written yet", not
 * broken). Pure and cheap — callers may memoize by `field.expression`.
 */
export function formulaDisplayInfo(field: DatabaseField): {
  parseError?: string;
} {
  if (field.type !== "formula" || field.expression.trim() === "") {
    return {};
  }
  const parsed = parseExpression(field.expression);
  return parsed.ok ? {} : { parseError: parsed.error.message };
}

/**
 * Whether any formula field's expression depends on the clock
 * (`now()`/`today()`) — callers re-evaluate the overlay on an interval when
 * true. Blank/unparseable expressions are never volatile.
 */
export function hasVolatileFormula(fields: readonly DatabaseField[]): boolean {
  return fields.some((field) => {
    if (field.type !== "formula") {
      return false;
    }
    const parsed = parseExpression(field.expression);
    return parsed.ok && isVolatileExpression(parsed.ast);
  });
}
