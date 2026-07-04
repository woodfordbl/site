/**
 * Bridges database rows into the expression engine: builds an
 * {@link ExprScope} that resolves `thisPage.X` / `thisRow.X` property
 * references against a row's fields and cell values by field NAME
 * (case-insensitive, trimmed).
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

function normalizeName(name: string): string {
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
    case "multiSelect": {
      // A real list value (Phase D): option NAMES in field-option order (the
      // same order cellToPlainText joins), so count()/filter()/join() work and
      // stale ids drop out. Default display still renders "A, B".
      if (!Array.isArray(coerced)) {
        return null;
      }
      const entries: { index: number; name: string }[] = [];
      for (const optionId of coerced) {
        const index = field.options.findIndex(
          (option) => option.id === optionId
        );
        if (index !== -1) {
          entries.push({ index, name: field.options[index].name });
        }
      }
      entries.sort((a, b) => a.index - b.index);
      return entries.map((entry) => entry.name);
    }
    case "select":
    case "date":
      return cellToPlainText(field, coerced);
    default:
      return null;
  }
}

/**
 * Create an {@link ExprScope} over one row. Property lookup is by field name
 * (case-insensitive, trimmed); when two fields share a normalized name the
 * first in schema order wins. Unknown names return an `ExprError` value —
 * never a throw.
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
  const fieldsByName = new Map<string, DatabaseField>();
  for (const field of fields) {
    const key = normalizeName(field.name);
    if (!fieldsByName.has(key)) {
      fieldsByName.set(key, field);
    }
  }
  const getProperty = (name: string): ExprValue => {
    const field = fieldsByName.get(normalizeName(name));
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
