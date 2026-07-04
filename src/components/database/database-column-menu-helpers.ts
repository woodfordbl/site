import type {
  DatabaseAggregateFn,
  DatabaseDateFormat,
  DatabaseField,
  DatabaseFieldType,
  DatabaseNumberFormat,
  DatabaseSelectOption,
} from "@/lib/schemas/database.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";

/**
 * Pure helpers behind the column header menu: Calculate-fn filtering per
 * field type, freeze-prefix computation, hide/wrap list edits, column-order
 * splicing, and select-option list edits. Sort-list mutations live in
 * `database-filter-helpers.ts` (shared with the filter bar's sort chips).
 * React-free so they stay unit testable.
 */

/** Aggregates valid for every field type (emptiness/count taxonomy). */
const UNIVERSAL_AGGREGATE_FNS = [
  "countAll",
  "countValues",
  "countUnique",
  "countEmpty",
  "countNotEmpty",
  "percentEmpty",
  "percentNotEmpty",
] as const satisfies readonly DatabaseAggregateFn[];

/** Numeric reducers — number fields only. */
const NUMBER_AGGREGATE_FNS = [
  "sum",
  "average",
  "median",
  "min",
  "max",
  "range",
] as const satisfies readonly DatabaseAggregateFn[];

/** Date reducers — date fields only. */
const DATE_AGGREGATE_FNS = [
  "earliest",
  "latest",
] as const satisfies readonly DatabaseAggregateFn[];

/**
 * The Calculate-menu aggregate functions valid for a field type, in menu
 * order: the universal count/percent taxonomy for everyone, plus numeric
 * reducers for numbers and formulas (formula columns reduce over their
 * number-typed computed values) and earliest/latest for dates.
 */
export function aggregateFnsForFieldType(
  type: DatabaseFieldType
): DatabaseAggregateFn[] {
  if (type === "number" || type === "formula") {
    return [...UNIVERSAL_AGGREGATE_FNS, ...NUMBER_AGGREGATE_FNS];
  }
  if (type === "date") {
    return [...UNIVERSAL_AGGREGATE_FNS, ...DATE_AGGREGATE_FNS];
  }
  return [...UNIVERSAL_AGGREGATE_FNS];
}

/**
 * Freeze prefix for "Freeze up to this column": the display-order prefix
 * ending at (and including) the field. Empty when the field is unknown.
 */
export function freezePrefixEndingAt(
  displayFieldIds: readonly string[],
  fieldId: string
): string[] {
  const index = displayFieldIds.indexOf(fieldId);
  return index === -1 ? [] : displayFieldIds.slice(0, index + 1);
}

/** Whether the view is frozen exactly at this prefix (→ the item unfreezes). */
export function isFrozenExactlyAt(
  pinnedFieldIds: readonly string[] | undefined,
  prefix: readonly string[]
): boolean {
  if (!pinnedFieldIds || pinnedFieldIds.length !== prefix.length) {
    return false;
  }
  return prefix.every((id, index) => pinnedFieldIds[index] === id);
}

/**
 * `visibleFieldIds` after hiding a field. When the view has no explicit list
 * (undefined = all visible), materialize it from all current field ids minus
 * the hidden one.
 */
export function visibleFieldIdsAfterHide(
  visibleFieldIds: readonly string[] | undefined,
  allFieldIds: readonly string[],
  fieldId: string
): string[] {
  const base = visibleFieldIds ?? allFieldIds;
  return base.filter((id) => id !== fieldId);
}

/** `wrapFieldIds` after toggling one field's wrap state. */
export function toggledWrapFieldIds(
  wrapFieldIds: readonly string[] | undefined,
  fieldId: string
): string[] {
  const base = wrapFieldIds ?? [];
  return base.includes(fieldId)
    ? base.filter((id) => id !== fieldId)
    : [...base, fieldId];
}

/**
 * The view's persisted LOGICAL column order over ALL fields (hidden
 * included): the stored `columnOrder` ids resolved against the schema (stale
 * ids and duplicates drop out), then every remaining field in schema order —
 * the id-list mirror of `resolveColumnOrder` without the visibility filter.
 * Order writes (e.g. insert left/right) must splice into this, never into
 * the grid's display order, which is pinned-first, hidden-excluding, and
 * viewport-dependent (auto-unpin) transient state.
 */
export function logicalColumnOrder(
  columnOrder: readonly string[] | undefined,
  allFieldIds: readonly string[]
): string[] {
  const known = new Set(allFieldIds);
  const ordered: string[] = [];
  const used = new Set<string>();
  for (const fieldId of columnOrder ?? []) {
    if (known.has(fieldId) && !used.has(fieldId)) {
      ordered.push(fieldId);
      used.add(fieldId);
    }
  }
  for (const fieldId of allFieldIds) {
    if (!used.has(fieldId)) {
      ordered.push(fieldId);
    }
  }
  return ordered;
}

/**
 * Column order after inserting a new field beside a target. When the target
 * is missing from the base order the new id appends at the end.
 */
export function columnOrderWithInsert(
  baseOrder: readonly string[],
  targetFieldId: string,
  side: "left" | "right",
  newFieldId: string
): string[] {
  const index = baseOrder.indexOf(targetFieldId);
  if (index === -1) {
    return [...baseOrder, newFieldId];
  }
  const at = side === "left" ? index : index + 1;
  return [...baseOrder.slice(0, at), newFieldId, ...baseOrder.slice(at)];
}

/**
 * `config.calculations` after picking an aggregate for a field — `null`
 * (the "None" item) removes the field's entry.
 */
export function calculationsWithSelection(
  calculations: Record<string, DatabaseAggregateFn> | undefined,
  fieldId: string,
  fn: DatabaseAggregateFn | null
): Record<string, DatabaseAggregateFn> {
  const next: Record<string, DatabaseAggregateFn> = {};
  for (const [key, value] of Object.entries(calculations ?? {})) {
    if (key !== fieldId) {
      next[key] = value;
    }
  }
  if (fn !== null) {
    next[fieldId] = fn;
  }
  return next;
}

type DatabaseFieldPatch = Partial<Omit<DatabaseField, "id">>;

/**
 * Field patch for "Change type": the new type plus fresh per-type defaults
 * (empty option lists for selects, no number format → "plain", an empty
 * expression for formulas — the user writes one via Edit property), clearing
 * the other variants' config keys. Cell values are NOT migrated this wave —
 * `coerceCellValue` already renders mismatched stored values as empty, so a
 * type change simply blanks incompatible cells until value coercion lands.
 *
 * The cast is required because `Partial` over the field union collapses to
 * its common keys; `updateDatabaseField` documents that per-variant patches
 * come from typed field editors like this one.
 */
export function fieldTypeChangePatch(
  type: DatabaseFieldType
): DatabaseFieldPatch {
  const options: DatabaseSelectOption[] | undefined =
    type === "select" || type === "multiSelect" ? [] : undefined;
  const format: DatabaseNumberFormat | undefined = undefined;
  const expression: string | undefined = type === "formula" ? "" : undefined;
  return { type, options, format, expression } as DatabaseFieldPatch;
}

/** Field patch replacing a formula field's expression source. */
export function expressionPatch(expression: string): DatabaseFieldPatch {
  return { expression } as DatabaseFieldPatch;
}

/** Field patch setting a number field's display format. */
export function numberFormatPatch(
  format: DatabaseNumberFormat
): DatabaseFieldPatch {
  return { format } as DatabaseFieldPatch;
}

/** Decimals stepper bounds (mirrors the schema's 0-6 cap). */
export const MAX_NUMBER_DECIMALS = 6;

/**
 * Next `decimals` value after one stepper click: "Auto" (undefined — the
 * format's natural precision) sits below 0, so decrementing 0 returns to
 * Auto and incrementing Auto lands on 0; steps clamp at the schema cap.
 */
export function steppedDecimals(
  decimals: number | undefined,
  delta: 1 | -1
): number | undefined {
  if (decimals === undefined) {
    return delta === 1 ? 0 : undefined;
  }
  const next = decimals + delta;
  if (next < 0) {
    return;
  }
  return Math.min(next, MAX_NUMBER_DECIMALS);
}

/**
 * Field patch setting a number field's fixed fraction digits — `undefined`
 * ("Auto") clears the key back to the format's natural precision.
 */
export function numberDecimalsPatch(
  decimals: number | undefined
): DatabaseFieldPatch {
  return { decimals } as DatabaseFieldPatch;
}

/**
 * Field patch setting a number field's thousands separators. Absent = on is
 * the schema convention, so enabling CLEARS the key and only `false` is ever
 * stored.
 */
export function numberGroupingPatch(useGrouping: boolean): DatabaseFieldPatch {
  return { useGrouping: useGrouping ? undefined : false } as DatabaseFieldPatch;
}

/**
 * Field patch setting a date field's display format. Absent = `default` is
 * the schema convention, so picking Default clears the key.
 */
export function dateFormatPatch(
  format: DatabaseDateFormat
): DatabaseFieldPatch {
  return {
    format: format === "default" ? undefined : format,
  } as DatabaseFieldPatch;
}

/** Field patch replacing a select/multi-select option list. */
export function selectOptionsPatch(
  options: readonly DatabaseSelectOption[]
): DatabaseFieldPatch {
  return { options } as DatabaseFieldPatch;
}

/** Options after renaming one option in place (blank names are ignored). */
export function renamedSelectOptions(
  options: readonly DatabaseSelectOption[],
  optionId: string,
  name: string
): DatabaseSelectOption[] {
  const trimmed = name.trim();
  if (trimmed === "") {
    return [...options];
  }
  return options.map((option) =>
    option.id === optionId ? { ...option, name: trimmed } : option
  );
}

/**
 * Options after appending a new one (color left default this wave). Blank
 * and duplicate names return the list unchanged.
 */
export function withAddedSelectOption(
  options: readonly DatabaseSelectOption[],
  name: string
): DatabaseSelectOption[] {
  const trimmed = name.trim();
  if (trimmed === "" || options.some((option) => option.name === trimmed)) {
    return [...options];
  }
  return [...options, { id: crypto.randomUUID(), name: trimmed }];
}

/**
 * Options after setting one option's color — `undefined` clears it back to
 * the default (colorless) pill. The color ids are the block-color palette
 * (`blockColorSchema`), shared with the canvas highlight picker.
 */
export function recoloredSelectOptions(
  options: readonly DatabaseSelectOption[],
  optionId: string,
  color: BlockColor | undefined
): DatabaseSelectOption[] {
  return options.map((option) =>
    option.id === optionId ? { ...option, color } : option
  );
}

/**
 * The exact select/multi-select field an option edit is scoped to, or
 * `undefined` when the id is unknown or not select-typed. Option edits MUST
 * be addressed by field id — an option id alone is ambiguous, since
 * "Duplicate property" clones can share option ids with their source field.
 */
export function selectFieldForOptionEdit(
  fields: readonly DatabaseField[],
  fieldId: string
): Extract<DatabaseField, { type: "select" | "multiSelect" }> | undefined {
  const field = fields.find((entry) => entry.id === fieldId);
  return field?.type === "select" || field?.type === "multiSelect"
    ? field
    : undefined;
}

/** Options after deleting one (stale ids in cell values render as empty). */
export function withoutSelectOption(
  options: readonly DatabaseSelectOption[],
  optionId: string
): DatabaseSelectOption[] {
  return options.filter((option) => option.id !== optionId);
}
