import { checkFormula, type FormulaCheckContext } from "@/lib/formula/check.ts";
import {
  formulaDateToDisplay,
  formulaValueToDisplay,
} from "@/lib/formula/display.ts";
import { evaluateFormula, isVolatileFormula } from "@/lib/formula/evaluate.ts";
import { type ParseFormulaResult, parseFormula } from "@/lib/formula/parse.ts";
import { createFormulaRowScope } from "@/lib/formula/row-scope.ts";
import { type FormulaType, UNKNOWN_TYPE } from "@/lib/formula/types.ts";
import {
  FormulaDate,
  type FormulaScope,
  type FormulaValue,
  formulaError,
  isFormulaError,
} from "@/lib/formula/values.ts";
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
 *
 * Formulas may reference other formulas in the same database: each overlay
 * call checks every formula field once (`checkFormula`, never per row) for
 * its static references, orders the fields topologically over the
 * formula→formula edges, and evaluates column-major — every field's values
 * land in a per-row `resolved` map the next field's scope reads. Reference
 * cycles are detected up front: every field in a cycle yields an error
 * result for all rows, named by the cycle path (`Circular reference:
 * Total → Subtotal → Total`), and references INTO a cycle propagate that
 * error value.
 */

/** One computed formula cell. */
export interface FormulaCellResult {
  /**
   * The result projected into the cell-value domain: evaluation errors,
   * non-finite numbers, and non-cell shapes (lambdas, rows) collapse to
   * `null` so filters/sorts/aggregates treat them as empty; dates project
   * to their ISO string; lists to their elements' display strings.
   */
  cellValue: DatabaseCellValue;
  /** Human display string (`formulaValueToDisplay`); errors read "⚠ …". */
  display: string;
  /** Whether evaluation produced an error value for this cell. */
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

/**
 * Project a formula value into the cell-value domain for the merged-row
 * pipeline: scalars pass through (non-finite numbers → null), dates render
 * `yyyy-mm-dd` when date-only and the full ISO instant otherwise, lists
 * become their elements' display strings, everything else (blank, errors,
 * lambdas, rows) is null.
 */
function formulaValueToCellValue(value: FormulaValue): DatabaseCellValue {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof FormulaDate) {
    return value.dateOnly
      ? formulaDateToDisplay(value)
      : value.date.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => formulaValueToDisplay(item));
  }
  return null;
}

function resultOf(value: FormulaValue): FormulaCellResult {
  if (isFormulaError(value)) {
    return {
      cellValue: null,
      display: formulaValueToDisplay(value),
      isError: true,
    };
  }
  return {
    cellValue: formulaValueToCellValue(value),
    display: formulaValueToDisplay(value),
    isError: false,
  };
}

// --- evaluation plan ---------------------------------------------------------

/**
 * Parse a formula field's expression, caching by expression string. Blank
 * expressions and parse failures return `null` (no AST) — the overlay maps
 * those fields to null cells and the display layer surfaces the parse error
 * separately (`formulaDisplayInfo`).
 */
function astFor(cache: Map<string, ParseFormulaResult>, expression: string) {
  if (expression.trim() === "") {
    return null;
  }
  let parsed = cache.get(expression);
  if (!parsed) {
    parsed = parseFormula(expression);
    cache.set(expression, parsed);
  }
  return parsed.ok ? parsed.ast : null;
}

type FormulaField = Extract<DatabaseField, { type: "formula" }>;

interface PlannedField {
  ast: ReturnType<typeof astFor>;
  /** Formula fields this field references (same database), source order. */
  deps: string[];
  field: FormulaField;
}

/**
 * How the overlay evaluates one schema: `cycleErrors` pre-seeds every row's
 * resolved map (and result) for cycle members; `ordered` lists the remaining
 * formula fields in dependency order.
 */
interface FormulaPlan {
  cycleErrors: Map<string, FormulaValue>;
  ordered: PlannedField[];
}

/** Build a check context; formula fields type from `types` (or unknown). */
function checkContextOf(
  fields: readonly DatabaseField[],
  types?: ReadonlyMap<string, FormulaType>
): FormulaCheckContext {
  return {
    properties: fields.map((field) => ({
      id: field.id,
      kind: field.type,
      name: field.name,
      type: types?.get(field.id) ?? UNKNOWN_TYPE,
    })),
  };
}

/** Parse + check every formula field, extracting formula→formula edges. */
function planFields(fields: readonly DatabaseField[]): PlannedField[] {
  const parseCache = new Map<string, ParseFormulaResult>();
  const context = checkContextOf(fields);
  const formulaIds = new Set<string>();
  for (const field of fields) {
    if (field.type === "formula") {
      formulaIds.add(field.id);
    }
  }
  const planned: PlannedField[] = [];
  for (const field of fields) {
    if (field.type !== "formula") {
      continue;
    }
    const ast = astFor(parseCache, field.expression);
    const deps =
      ast === null
        ? []
        : checkFormula(ast, context).references.filter((id) =>
            formulaIds.has(id)
          );
    planned.push({ ast, deps, field });
  }
  return planned;
}

/**
 * The dependency cycle through `start`, as field ids `[start, …]`, or null
 * when `start` is not on any cycle. Depth-first over formula→formula edges;
 * bounded by the (small) number of formula fields.
 */
function cyclePathFrom(
  start: string,
  deps: ReadonlyMap<string, readonly string[]>
): string[] | null {
  const path: string[] = [start];
  const visited = new Set<string>([start]);
  const walk = (node: string): boolean => {
    for (const dep of deps.get(node) ?? []) {
      if (dep === start) {
        return true;
      }
      if (visited.has(dep)) {
        continue;
      }
      visited.add(dep);
      path.push(dep);
      if (walk(dep)) {
        return true;
      }
      path.pop();
    }
    return false;
  };
  return walk(start) ? path : null;
}

/** `Circular reference: Total → Subtotal → Total` (names, cycle order). */
function cycleMessage(
  path: readonly string[],
  nameOf: (id: string) => string
): string {
  const names = [...path.map(nameOf), nameOf(path[0])];
  return `Circular reference: ${names.join(" → ")}`;
}

/** Kahn-style ordering over non-cycle fields; cycle deps count satisfied. */
function topoOrder(
  planned: readonly PlannedField[],
  cycleIds: ReadonlySet<string>
): PlannedField[] {
  const ordered: PlannedField[] = [];
  const done = new Set<string>(cycleIds);
  const queue = planned.filter((plan) => !cycleIds.has(plan.field.id));
  let progress = true;
  while (progress) {
    progress = false;
    for (let index = 0; index < queue.length; index += 1) {
      const plan = queue[index];
      if (plan.deps.every((dep) => done.has(dep))) {
        ordered.push(plan);
        done.add(plan.field.id);
        queue.splice(index, 1);
        index -= 1;
        progress = true;
      }
    }
  }
  // Defensive: cycle detection covers everything reachable, so the queue is
  // empty here; if it ever weren't, appending keeps every field producing a
  // result (unresolved formula deps read as blank).
  return [...ordered, ...queue];
}

/** Build the evaluation plan: parse, check, detect cycles, order fields. */
function buildFormulaPlan(fields: readonly DatabaseField[]): FormulaPlan {
  const planned = planFields(fields);
  const deps = new Map<string, readonly string[]>(
    planned.map((plan) => [plan.field.id, plan.deps])
  );
  const names = new Map(
    planned.map((plan) => [plan.field.id, plan.field.name])
  );
  const cycleErrors = new Map<string, FormulaValue>();
  for (const plan of planned) {
    const path = cyclePathFrom(plan.field.id, deps);
    if (path !== null) {
      cycleErrors.set(
        plan.field.id,
        formulaError(cycleMessage(path, (id) => names.get(id) ?? id))
      );
    }
  }
  return {
    cycleErrors,
    ordered: topoOrder(planned, new Set(cycleErrors.keys())),
  };
}

// --- evaluation ---------------------------------------------------------------

interface RowEvaluation {
  resolved: Map<string, FormulaValue>;
  scope: FormulaScope;
}

/** One row's scope + resolved map, pre-seeded with the plan's cycle errors. */
function rowEvaluationOf(
  plan: FormulaPlan,
  fields: readonly DatabaseField[],
  values: Record<string, DatabaseCellValue>,
  opts?: ComputeFormulaOverlayOptions
): RowEvaluation {
  const resolved = new Map<string, FormulaValue>(plan.cycleErrors);
  const scope = createFormulaRowScope(
    fields,
    values,
    resolved,
    opts?.now === undefined ? undefined : { now: opts.now }
  );
  return { resolved, scope };
}

/**
 * Evaluate every formula field over every row. Expressions parse and check
 * once per call (per field, never per row); evaluation is column-major in
 * topological order so each field's scope sees every dependency's value for
 * that row in `resolved`. Blank and parse-error expressions yield null cells
 * for every row — including rows with stale stored values under the field id
 * (e.g. after a type change), which the overlay deliberately shadows.
 */
export function computeFormulaOverlay(
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  opts?: ComputeFormulaOverlayOptions
): FormulaOverlay {
  const overlay: FormulaOverlay = new Map();
  if (!fields.some((field) => field.type === "formula")) {
    return overlay;
  }
  const plan = buildFormulaPlan(fields);
  const evaluations: RowEvaluation[] = [];
  for (const row of rows) {
    evaluations.push(rowEvaluationOf(plan, fields, row.values, opts));
    const entry: Record<string, FormulaCellResult> = {};
    for (const [fieldId, error] of plan.cycleErrors) {
      entry[fieldId] = resultOf(error);
    }
    overlay.set(row.id, entry);
  }
  for (const { ast, field } of plan.ordered) {
    for (const [index, row] of rows.entries()) {
      const { resolved, scope } = evaluations[index];
      const value = ast === null ? null : evaluateFormula(ast, scope);
      resolved.set(field.id, value);
      const entry = overlay.get(row.id);
      if (entry) {
        entry[field.id] = ast === null ? EMPTY_RESULT : resultOf(value);
      }
    }
  }
  return overlay;
}

/**
 * Every formula field's computed value for ONE row (same plan the overlay
 * uses: topological order, cycle members as error values, blank/parse-error
 * expressions as blank). Feeds single-row surfaces — the row-page
 * properties panel and the editor preview — and the preview scope's
 * `resolved` map, so a draft formula can reference other formulas.
 */
export function computeFormulaRowValues(
  fields: readonly DatabaseField[],
  values: Record<string, DatabaseCellValue>,
  opts?: ComputeFormulaOverlayOptions
): ReadonlyMap<string, FormulaValue> {
  const plan = buildFormulaPlan(fields);
  const { resolved, scope } = rowEvaluationOf(plan, fields, values, opts);
  for (const { ast, field } of plan.ordered) {
    resolved.set(field.id, ast === null ? null : evaluateFormula(ast, scope));
  }
  return resolved;
}

// --- static typing for the editor ----------------------------------------------

/**
 * Result types of every formula field, computed in the same topological
 * order the overlay evaluates in, so a formula referencing another formula
 * types against its dependency's real result type. Cycle members and
 * blank/unparseable expressions type as `unknown`.
 */
export function formulaFieldTypes(
  fields: readonly DatabaseField[]
): ReadonlyMap<string, FormulaType> {
  const plan = buildFormulaPlan(fields);
  const types = new Map<string, FormulaType>();
  for (const fieldId of plan.cycleErrors.keys()) {
    types.set(fieldId, UNKNOWN_TYPE);
  }
  for (const { ast, field } of plan.ordered) {
    if (ast === null) {
      types.set(field.id, UNKNOWN_TYPE);
      continue;
    }
    types.set(
      field.id,
      checkFormula(ast, checkContextOf(fields, types)).resultType
    );
  }
  return types;
}

/**
 * The check context for a database schema, formula fields typed via
 * {@link formulaFieldTypes} — what the formula editor checks drafts against.
 */
export function formulaCheckContext(
  fields: readonly DatabaseField[]
): FormulaCheckContext {
  return checkContextOf(fields, formulaFieldTypes(fields));
}

// --- merged rows ----------------------------------------------------------------

/**
 * Display prefix every evaluation-error marker starts with (matches
 * `formulaValueToDisplay`'s error rendering).
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
  const parsed = parseFormula(field.expression);
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
    const parsed = parseFormula(field.expression);
    return parsed.ok && isVolatileFormula(parsed.ast);
  });
}
