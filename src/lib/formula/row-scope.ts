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
 * texts, relation → a list of {@link FormulaRowRef}s into the target
 * database (empty for blank cells, stale ids skipped), empty/mistyped cells
 * → blank. Formula fields read from the `resolved` map of already-computed
 * values the overlay threads through (`lib/databases/formula-values.ts` owns
 * ordering and cycle detection).
 *
 * Member access on a row ref (`r.Estimate`) resolves here too
 * ({@link resolveFormulaRowMember}), against the target database the scope's
 * {@link FormulaRelationResolver} exposes. Cross-row members resolve by
 * field NAME (id accepted too) — a v1 limitation: renaming a target field
 * breaks formulas that reference it by name, because member references are
 * not id-canonicalized the way same-row `prop("…")` references are. The
 * dependency-graph stage (P3.3) is where member canonicalization would land.
 */

import {
  cellToPlainText,
  coerceCellValue,
  toIsoDatePart,
} from "@/lib/databases/cell-values.ts";
import { normalizeFormulaPropertyName } from "@/lib/formula/check.ts";
import {
  DATABASE_REF_UNAVAILABLE_MESSAGE,
  FormulaDate,
  type FormulaPreparedUserFunctions,
  type FormulaRelationResolver,
  FormulaRowRef,
  type FormulaScope,
  type FormulaValue,
  formulaError,
  formulaUnknownDatabaseMessage,
} from "@/lib/formula/values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";

/** Options for {@link createFormulaRowScope}. */
export interface CreateFormulaRowScopeOptions {
  /** Injected clock for `now()`/`today()`; omit for the deterministic fixed epoch. */
  now?: () => Date;
  /**
   * Cross-database reader for relation fields. Absent (pure callers, legacy
   * paths), relation cells read as blank and row members can't resolve.
   */
  relations?: FormulaRelationResolver;
  /**
   * Named user-defined functions (prepared registry). Absent, user-function
   * calls read as unknown functions.
   */
  userFunctions?: FormulaPreparedUserFunctions;
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
 * A relation cell as a list of row refs into the target database. ALWAYS a
 * list — a blank/missing cell is the EMPTY list, not blank, so rollups over
 * unlinked rows aggregate to 0/empty instead of propagating blank. Stored
 * ids that no longer resolve to a target row (deleted rows, retargeted
 * relations) are skipped, and an unresolvable target database yields the
 * empty list too.
 */
function relationCellToRowRefs(
  field: DatabaseField & { type: "relation" },
  coerced: readonly string[] | null,
  relations: FormulaRelationResolver
): FormulaValue {
  const target = relations.database(field.targetDatabaseId);
  if (target === null || coerced === null) {
    return [];
  }
  const refs: FormulaValue[] = [];
  for (const rowId of coerced) {
    if (target.row(rowId) !== null) {
      refs.push(new FormulaRowRef(field.targetDatabaseId, rowId));
    }
  }
  return refs;
}

/**
 * Map a stored cell to a formula value, mirroring the checker's
 * `formulaPropertyValueType`. Empty, missing, and mistyped cells are blank —
 * with three deliberate exceptions that keep runtime values matching the
 * checker's static types: a relation cell is always a list (see
 * {@link relationCellToRowRefs}) when a resolver is on hand (blank without
 * one — pure callers that predate relations keep their behavior); an unset
 * checkbox is `false`, never blank, so `if(thisPage.Done, …)` works on rows
 * that were never toggled; and an unset multiSelect is the EMPTY list, the
 * same rule relations follow, so `length()`/`includes()` never trip over
 * blank.
 */
function cellToFormulaValue(
  field: DatabaseField,
  raw: DatabaseCellValue | undefined,
  relations?: FormulaRelationResolver
): FormulaValue {
  const coerced = coerceCellValue(field, raw);
  if (field.type === "relation" && relations !== undefined) {
    return relationCellToRowRefs(
      field,
      Array.isArray(coerced) ? coerced : null,
      relations
    );
  }
  if (field.type === "checkbox") {
    return coerced === true;
  }
  if (field.type === "multiSelect") {
    return Array.isArray(coerced) ? multiSelectCellToList(field, coerced) : [];
  }
  if (coerced === null) {
    return null;
  }
  switch (field.type) {
    case "text":
    case "url":
      return typeof coerced === "string" ? coerced : null;
    case "number":
      return typeof coerced === "number" ? coerced : null;
    case "select":
      return cellToPlainText(field, coerced);
    case "date":
      return typeof coerced === "string"
        ? dateCellToFormulaDate(coerced)
        : null;
    default:
      return null;
  }
}

/** Id- and normalized-name-keyed lookup maps over one schema's fields. */
interface FieldIndex {
  byId: ReadonlyMap<string, DatabaseField>;
  byName: ReadonlyMap<string, DatabaseField>;
}

/**
 * Per-schema field index, memoized on the fields array's identity. Scopes
 * are created per row — at 10k rows × 20 fields the two maps were ~80% of a
 * scope's construction cost, for a schema that never changes mid-pass; the
 * WeakMap makes them once per schema instead.
 */
const FIELD_INDEX_CACHE = new WeakMap<readonly DatabaseField[], FieldIndex>();

function fieldIndexOf(fields: readonly DatabaseField[]): FieldIndex {
  let index = FIELD_INDEX_CACHE.get(fields);
  if (index === undefined) {
    const byId = new Map<string, DatabaseField>();
    const byName = new Map<string, DatabaseField>();
    for (const field of fields) {
      byId.set(field.id, field);
      const key = normalizeFormulaPropertyName(field.name);
      if (!byName.has(key)) {
        byName.set(key, field);
      }
    }
    index = { byId, byName };
    FIELD_INDEX_CACHE.set(fields, index);
  }
  return index;
}

/** Field lookup by exact id first, then normalized name (first match wins). */
function fieldForMemberName(
  fields: readonly DatabaseField[],
  name: string
): DatabaseField | undefined {
  const index = fieldIndexOf(fields);
  return (
    index.byId.get(name) ?? index.byName.get(normalizeFormulaPropertyName(name))
  );
}

/**
 * Resolve `ref.<name>` — member access on a relation row ref. Field lookup
 * follows the same id-then-name rule as `getProperty`; the member's value
 * maps through {@link cellToFormulaValue} (so a relation member recurses
 * into another row-ref list), and a FORMULA member computes through the
 * resolver's `formulaValue` (the target database's own plan, cross-database
 * cycles guarded by the implementation). Stale refs — the row or its whole
 * database no longer resolving — read as blank; an unknown member name is an
 * error naming the target database, mirroring the checker's diagnostic.
 */
export function resolveFormulaRowMember(
  ref: FormulaRowRef,
  name: string,
  relations: FormulaRelationResolver | undefined
): FormulaValue {
  if (relations === undefined) {
    // Row refs are only minted by a resolver-equipped scope, so this is a
    // caller wiring bug (e.g. a scope rebuilt without `relations`).
    return formulaError("Related rows are not available here");
  }
  const database = relations.database(ref.databaseId);
  if (database === null) {
    return null;
  }
  const field = fieldForMemberName(database.fields, name);
  if (field === undefined) {
    return formulaError(`"${name}" isn't a property of ${database.name}`);
  }
  if (field.type === "formula") {
    return (
      relations.formulaValue?.(ref.databaseId, ref.rowId, field.id) ?? null
    );
  }
  const values = database.row(ref.rowId);
  if (values === null) {
    return null;
  }
  return cellToFormulaValue(field, values[field.id], relations);
}

/**
 * Resolve `db("<databaseId>")` — a whole-database reference — to the target
 * database's rows as a row-ref list, the same value shape a relation cell
 * produces, so everything relation values compose with (map/filter/member
 * access, rollup aggregation) works unchanged. Ids come from the resolver's
 * `rowIds` enumeration of LIVE rows, so unlike relation cells there are no
 * stale ids to skip. A resolver that can't enumerate (absent, or predating
 * `rowIds`) reads as an unavailability error; an id naming no database reads
 * as the checker's own unknown-database message. Never throws.
 */
export function resolveFormulaDatabaseRows(
  databaseId: string,
  relations: FormulaRelationResolver | undefined
): FormulaValue {
  if (relations?.rowIds === undefined) {
    return formulaError(DATABASE_REF_UNAVAILABLE_MESSAGE);
  }
  const rowIds = relations.rowIds(databaseId);
  if (rowIds === null) {
    return formulaError(formulaUnknownDatabaseMessage(databaseId));
  }
  return rowIds.map(
    (rowId): FormulaValue => new FormulaRowRef(databaseId, rowId)
  );
}

/**
 * Display label for a row ref: the target row's primary-field text, blank
 * titles (and unresolvable refs) reading "Untitled" — the same rule relation
 * cell chips use.
 */
export function formulaRowRefLabel(
  ref: FormulaRowRef,
  relations: FormulaRelationResolver | undefined
): string {
  const database = relations?.database(ref.databaseId);
  const primaryField = database?.fields.find(
    (field) => field.id === database.primaryFieldId
  );
  const values = database?.row(ref.rowId);
  if (!(database && primaryField && values)) {
    return "Untitled";
  }
  const title = cellToPlainText(primaryField, values[primaryField.id]).trim();
  return title === "" ? "Untitled" : title;
}

/** Reusable label callback for display projections, or undefined without a resolver. */
export function formulaRowLabelOf(
  relations: FormulaRelationResolver | undefined
): ((ref: FormulaRowRef) => string) | undefined {
  if (relations === undefined) {
    return;
  }
  return (ref) => formulaRowRefLabel(ref, relations);
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
  const { byId: fieldsById, byName: fieldsByName } = fieldIndexOf(fields);
  const relations = opts?.relations;
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
    return cellToFormulaValue(field, values[field.id], relations);
  };
  const scope: FormulaScope = { getProperty };
  if (opts?.now !== undefined) {
    scope.now = opts.now;
  }
  if (relations !== undefined) {
    scope.relations = relations;
  }
  if (opts?.userFunctions !== undefined) {
    scope.userFunctions = opts.userFunctions;
  }
  return scope;
}
