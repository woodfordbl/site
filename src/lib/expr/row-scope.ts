/**
 * Bridges database rows into the expression engine: builds an
 * {@link ExprScope} that resolves property references against a row's fields
 * and cell values — by exact field ID first (the canonical `prop("<id>")`
 * form), then by field NAME (case-insensitive, trimmed) for the
 * `thisPage.X` / `thisRow.X` display forms.
 */

import {
  cellToPlainText,
  coerceCellValue,
} from "@/lib/databases/cell-values.ts";
import {
  type ExprScope,
  type ExprValue,
  exprError,
} from "@/lib/expr/evaluate.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";

/** Options for {@link createRowScope}. */
export interface CreateRowScopeOptions {
  /** Injected clock for `now()`/`today()`; omit for the deterministic fixed epoch. */
  now?: () => Date;
}

/**
 * Name-reference normalization shared with the source rewriters
 * (`ref-rewrite.ts`) so "which field does this name mean" never drifts
 * between evaluation and canonicalization.
 */
export function normalizePropertyName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Map a stored cell to an expression value: text/url/number/checkbox pass
 * through as string/number/boolean; select option ids resolve to option
 * NAMES (the human value, stale ids drop to `""`); multiSelect joins names
 * with ", "; dates reduce to their `yyyy-mm-dd` ISO part (so string
 * comparison is date-correct); empty/missing/mistyped cells become `null`.
 */
function cellToExprValue(
  field: DatabaseField,
  raw: DatabaseCellValue | undefined
): ExprValue {
  const coerced = coerceCellValue(field, raw);
  if (coerced === null) {
    return null;
  }
  switch (field.type) {
    case "text":
    case "url":
      return typeof coerced === "string" ? coerced : null;
    case "number":
      return typeof coerced === "number" ? coerced : null;
    case "checkbox":
      return typeof coerced === "boolean" ? coerced : null;
    case "select":
    case "multiSelect":
    case "date":
      return cellToPlainText(field, coerced);
    default:
      return null;
  }
}

/**
 * Create an {@link ExprScope} over one row. Property lookup tries an exact
 * field ID match first (canonical `prop("<id>")` references survive renames),
 * then falls back to field name (case-insensitive, trimmed); when two fields
 * share a normalized name the first in schema order wins. Unknown references
 * return an `ExprError` value — never a throw.
 *
 * Formula fields are EXCLUDED from the scope in v1: referencing one returns
 * "Formulas cannot reference other formulas yet". This guarantees cycle
 * safety without a dependency graph. The Phase 6 plan (databases proposal
 * §3.3/§6) replaces this guard with a column-level dependency DAG —
 * formula → referenced fields edges, topological evaluation with per-row
 * dirty sets, and cycle detection at definition time — at which point
 * formula fields join the scope like any other field.
 */
export function createRowScope(
  fields: DatabaseField[],
  values: Record<string, DatabaseCellValue>,
  opts?: CreateRowScopeOptions
): ExprScope {
  const fieldsById = new Map<string, DatabaseField>();
  const fieldsByName = new Map<string, DatabaseField>();
  for (const field of fields) {
    fieldsById.set(field.id, field);
    const key = normalizePropertyName(field.name);
    if (!fieldsByName.has(key)) {
      fieldsByName.set(key, field);
    }
  }
  const getProperty = (name: string): ExprValue => {
    const field =
      fieldsById.get(name) ?? fieldsByName.get(normalizePropertyName(name));
    if (field === undefined) {
      return exprError(`Unknown property "${name}"`);
    }
    if (field.type === "formula") {
      return exprError("Formulas cannot reference other formulas yet");
    }
    return cellToExprValue(field, values[field.id]);
  };
  const now = opts?.now;
  return now === undefined ? { getProperty } : { getProperty, now };
}
