import { formatCellValue } from "@/lib/databases/cell-values.ts";
import { operatorNeedsValue } from "@/lib/databases/field-defs.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilterCondition,
  DatabaseFilterGroup,
  DatabaseFilterGroupOp,
  DatabaseFilterInnerGroup,
} from "@/lib/schemas/database.ts";

/**
 * Pure helpers for the filter chip bar: immutable root-group mutations over
 * the `DatabaseFilterGroup` grammar and chip label formatting. React-free so
 * they stay unit testable.
 */

/** One root-level entry of a filter group. */
export type DatabaseFilterEntry =
  | DatabaseFilterCondition
  | DatabaseFilterInnerGroup;

/** Whether a root-level filter entry is a nested inner group. */
export function isFilterInnerGroup(
  entry: DatabaseFilterEntry
): entry is DatabaseFilterInnerGroup {
  return "conditions" in entry;
}

/**
 * Append a condition at the root level, creating an `and` root group when the
 * view has no filter yet.
 */
export function appendFilterCondition(
  filter: DatabaseFilterGroup | undefined,
  condition: DatabaseFilterCondition
): DatabaseFilterGroup {
  if (!filter) {
    return { op: "and", conditions: [condition] };
  }
  return { ...filter, conditions: [...filter.conditions, condition] };
}

/**
 * Remove the root entry (condition or inner group) with the given id.
 * Removing the last entry clears the filter entirely (`undefined`).
 */
export function removeFilterEntry(
  filter: DatabaseFilterGroup,
  entryId: string
): DatabaseFilterGroup | undefined {
  const conditions = filter.conditions.filter((entry) => entry.id !== entryId);
  if (conditions.length === 0) {
    return;
  }
  return { ...filter, conditions };
}

/** Merge an operator/value patch into the matching root-level condition. */
export function patchFilterCondition(
  filter: DatabaseFilterGroup,
  conditionId: string,
  patch: Partial<Pick<DatabaseFilterCondition, "operator" | "value">>
): DatabaseFilterGroup {
  return {
    ...filter,
    conditions: filter.conditions.map((entry) =>
      !isFilterInnerGroup(entry) && entry.id === conditionId
        ? { ...entry, ...patch }
        : entry
    ),
  };
}

/** Switch the root group between "Match all" (`and`) and "Match any" (`or`). */
export function setFilterOp(
  filter: DatabaseFilterGroup,
  op: DatabaseFilterGroupOp
): DatabaseFilterGroup {
  return { ...filter, op };
}

/**
 * Normalize a select/multi-select condition value to a list of option ids —
 * a bare string is a single selection, anything else non-array is none.
 */
export function conditionOptionIds(
  value: DatabaseCellValue | undefined
): string[] {
  if (typeof value === "string" && value !== "") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string");
  }
  return [];
}

/**
 * Toggle an option id in a select/multi-select condition value. A single
 * selection stays a bare option id string (the shape the filter evaluator's
 * single-target operators compare against); multiple selections store the id
 * array — chip-label ready now, "is any of" evaluation arrives with the query
 * compiler. No selection clears the value (`undefined`).
 */
export function toggleConditionOptionId(
  value: DatabaseCellValue | undefined,
  optionId: string
): string | string[] | undefined {
  const ids = conditionOptionIds(value);
  const next = ids.includes(optionId)
    ? ids.filter((id) => id !== optionId)
    : [...ids, optionId];
  if (next.length === 0) {
    return;
  }
  return next.length === 1 ? next[0] : next;
}

/** Selected option names listed on a chip before collapsing to "n selected". */
export const MAX_LISTED_OPTION_VALUES = 2;

/**
 * Chip label for a condition's value segment. Empty string means "no value
 * yet" — the chip renders its placeholder. Select values resolve option ids
 * to names (stale ids drop out) and collapse beyond
 * `MAX_LISTED_OPTION_VALUES` to "n selected".
 */
export function conditionValueLabel(
  field: DatabaseField,
  condition: DatabaseFilterCondition
): string {
  if (!operatorNeedsValue(condition.operator)) {
    return "";
  }
  const value = condition.value;
  switch (field.type) {
    case "select":
    case "multiSelect": {
      const names = conditionOptionIds(value)
        .map((id) => field.options.find((option) => option.id === id)?.name)
        .filter((name): name is string => Boolean(name));
      if (names.length === 0) {
        return "";
      }
      return names.length > MAX_LISTED_OPTION_VALUES
        ? `${names.length} selected`
        : names.join(", ");
    }
    case "checkbox":
      // The evaluator treats a missing target as unchecked, so label it that way.
      return value === true ? "Checked" : "Unchecked";
    case "text":
    case "url":
      return typeof value === "string" ? value : "";
    case "number":
    case "date":
      return formatCellValue(field, value ?? null);
    default:
      return "";
  }
}

/**
 * Label for an existing inner group's read-only chip, e.g. "(2 conditions ·
 * or)". Group creation/editing UI is deferred; groups render with a remove
 * action only this wave.
 */
export function innerGroupChipLabel(group: DatabaseFilterInnerGroup): string {
  const count = group.conditions.length;
  const noun = count === 1 ? "condition" : "conditions";
  return `(${count} ${noun} · ${group.op})`;
}
