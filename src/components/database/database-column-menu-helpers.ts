import type {
  DatabaseAggregateFn,
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
 * reducers for numbers and earliest/latest for dates.
 */
export function aggregateFnsForFieldType(
  type: DatabaseFieldType
): DatabaseAggregateFn[] {
  if (type === "number") {
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
 * (empty option lists for selects, no number format → "plain"), clearing the
 * other variants' config keys. Cell values are NOT migrated this wave —
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
  return { type, options, format } as DatabaseFieldPatch;
}

/** Field patch setting a number field's display format. */
export function numberFormatPatch(
  format: DatabaseNumberFormat
): DatabaseFieldPatch {
  return { format } as DatabaseFieldPatch;
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

/** Options after deleting one (stale ids in cell values render as empty). */
export function withoutSelectOption(
  options: readonly DatabaseSelectOption[],
  optionId: string
): DatabaseSelectOption[] {
  return options.filter((option) => option.id !== optionId);
}
