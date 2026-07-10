/**
 * Bridges database rows into the v2 formula engine: builds a
 * {@link FormulaScope} that resolves property references against a row's
 * fields and cell values — by exact field ID first (the canonical
 * `prop("<id>")` form), then by field NAME (case-insensitive, trimmed) for
 * the `thisPage.X` / `thisRow.X` display forms.
 *
 * Cell → value mapping mirrors the checker's `formulaPropertyValueType`
 * exactly, so checking and evaluation can never disagree: text/url → text,
 * number → number, checkbox → boolean, date → a date-only `FormulaDate`,
 * select → the option NAME as text, multiSelect → a real LIST of option-name
 * texts, empty/mistyped cells → blank. Formula fields read from the
 * `resolved` map of already-computed values the overlay threads through
 * (`lib/databases/formula-values.ts` owns ordering and cycle detection).
 */

import {
  cellToPlainText,
  coerceCellValue,
  toIsoDatePart,
} from "@/lib/databases/cell-values.ts";
import { normalizeFormulaPropertyName } from "@/lib/formula/check.ts";
import {
  FormulaDate,
  type FormulaScope,
  type FormulaValue,
  formulaError,
} from "@/lib/formula/values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";

/** Options for {@link createFormulaRowScope}. */
export interface CreateFormulaRowScopeOptions {
  /** Injected clock for `now()`/`today()`; omit for the deterministic fixed epoch. */
  now?: () => Date;
}

/**
 * Already-computed formula values for one row, keyed by formula field id —
 * the overlay fills this in topological order, and cycle members carry their
 * `FormulaError` here so references propagate the cycle message.
 */
export type ResolvedFormulaValues = ReadonlyMap<string, FormulaValue>;

/**
 * A date cell as a local-midnight, date-only {@link FormulaDate}; malformed
 * stored strings are blank (`coerceCellValue` already dropped non-dates, so
 * this only guards ISO-ish strings whose date part fails to normalize).
 */
function dateCellToFormulaDate(coerced: string): FormulaValue {
  const datePart = toIsoDatePart(coerced);
  if (datePart === "") {
    return null;
  }
  const [year, month, day] = datePart.split("-").map(Number);
  return new FormulaDate(new Date(year, month - 1, day), true);
}

/**
 * A multiSelect cell as a real list of option-name texts — field option
 * order, stale ids dropped (matching `cellToPlainText`'s projection, minus
 * the ", " join).
 */
function multiSelectCellToList(
  field: DatabaseField & { type: "multiSelect" },
  coerced: readonly string[]
): FormulaValue {
  const chosen = new Set(coerced);
  return field.options
    .filter((option) => chosen.has(option.id))
    .map((option): FormulaValue => option.name);
}

/**
 * Map a stored cell to a formula value, mirroring the checker's
 * `formulaPropertyValueType`. Empty, missing, and mistyped cells are blank.
 */
function cellToFormulaValue(
  field: DatabaseField,
  raw: DatabaseCellValue | undefined
): FormulaValue {
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
      return cellToPlainText(field, coerced);
    case "multiSelect":
      return Array.isArray(coerced)
        ? multiSelectCellToList(field, coerced)
        : null;
    case "date":
      return typeof coerced === "string"
        ? dateCellToFormulaDate(coerced)
        : null;
    default:
      return null;
  }
}

/**
 * Create a {@link FormulaScope} over one row. Property lookup tries an exact
 * field ID match first (canonical `prop("<id>")` references survive renames),
 * then falls back to field name (normalized via
 * {@link normalizeFormulaPropertyName} — the same rule the checker and the
 * ref rewriters use); when two fields share a normalized name the first in
 * schema order wins. Unknown references return a `FormulaError` value —
 * never a throw.
 *
 * Formula fields resolve through `resolved` — the caller's map of
 * already-computed values for THIS row. The map is read lazily at
 * `getProperty` time, so the overlay can share one scope per row while it
 * fills the map field-by-field in topological order. A formula field absent
 * from the map (blank or unparseable expression) reads as blank.
 */
export function createFormulaRowScope(
  fields: readonly DatabaseField[],
  values: Record<string, DatabaseCellValue>,
  resolved?: ResolvedFormulaValues,
  opts?: CreateFormulaRowScopeOptions
): FormulaScope {
  const fieldsById = new Map<string, DatabaseField>();
  const fieldsByName = new Map<string, DatabaseField>();
  for (const field of fields) {
    fieldsById.set(field.id, field);
    const key = normalizeFormulaPropertyName(field.name);
    if (!fieldsByName.has(key)) {
      fieldsByName.set(key, field);
    }
  }
  const getProperty = (name: string): FormulaValue => {
    const field =
      fieldsById.get(name) ??
      fieldsByName.get(normalizeFormulaPropertyName(name));
    if (field === undefined) {
      return formulaError(`Unknown property "${name}"`);
    }
    if (field.type === "formula") {
      return resolved?.get(field.id) ?? null;
    }
    return cellToFormulaValue(field, values[field.id]);
  };
  const now = opts?.now;
  return now === undefined ? { getProperty } : { getProperty, now };
}
