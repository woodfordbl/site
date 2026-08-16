import { formatCellValue } from "@/lib/databases/cell-values.ts";
import {
  isRelativeDateOperator,
  operatorNeedsValue,
} from "@/lib/databases/field-defs.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilterCondition,
  DatabaseFilterGroup,
  DatabaseFilterGroupOp,
  DatabaseFilterInnerGroup,
  DatabaseSort,
} from "@/lib/schemas/database.ts";

/**
 * Pure helpers for the filter chip bar: immutable root-group mutations over
 * the `DatabaseFilterGroup` grammar, multi-sort list mutations, and chip
 * label formatting. React-free so they stay unit testable.
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
 * Whether any condition in the filter — root level or inside an inner group —
 * uses a relative date operator (`pastDay`…`nextMonth`). Such filters change
 * results as time passes, so the table view's display clock must tick and
 * re-run `applyFilter` while one is active.
 */
export function filterHasRelativeOperator(
  filter: DatabaseFilterGroup | undefined
): boolean {
  if (!filter) {
    return false;
  }
  return filter.conditions.some((entry) =>
    isFilterInnerGroup(entry)
      ? entry.conditions.some((condition) =>
          isRelativeDateOperator(condition.operator)
        )
      : isRelativeDateOperator(entry.operator)
  );
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
 * Date condition value label: a single date formats through the field's date
 * display; a `between` pair (`[startIso, endIso]`) reads "Jan 5, 2026 –
 * Feb 2, 2026". Half-formed or wrong-shaped pairs read as "no value yet".
 */
function dateConditionValueLabel(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): string {
  if (Array.isArray(value)) {
    if (value.length !== 2) {
      return "";
    }
    const start = formatCellValue(field, value[0]);
    const end = formatCellValue(field, value[1]);
    return start !== "" && end !== "" ? `${start} – ${end}` : "";
  }
  return formatCellValue(field, value ?? null);
}

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
    // Formula conditions carry the raw typed value (the editor commits
    // strings; older conditions may hold numbers) — label it verbatim.
    case "formula":
      if (typeof value === "number") {
        return String(value);
      }
      return typeof value === "string" ? value : "";
    case "number":
      return formatCellValue(field, value ?? null);
    case "date":
      return dateConditionValueLabel(field, value);
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

/*
 * Multi-sort mutations. `view.sorts` is the priority list — index 0 is the
 * primary key (`applySorts` compares in list order), so "priority" here is
 * just 1-based position. Helpers that can empty the list return `undefined`
 * so callers can hand the result straight to `updateDatabaseView` (an unset
 * sorts key restores manual drag order).
 */

/** The view's sort entry for a field, if any. */
export function sortEntryFor(
  sorts: readonly DatabaseSort[] | undefined,
  fieldId: string
): DatabaseSort | undefined {
  return sorts?.find((sort) => sort.fieldId === fieldId);
}

/** 1-based sort priority of a field; 0 when the field is not sorted. */
export function sortPriority(
  sorts: readonly DatabaseSort[] | undefined,
  fieldId: string
): number {
  const index = (sorts ?? []).findIndex((sort) => sort.fieldId === fieldId);
  return index + 1;
}

/** Sorts with one field's direction flipped in place (priority unchanged). */
export function flippedSortDirection(
  sorts: readonly DatabaseSort[],
  fieldId: string
): DatabaseSort[] {
  return sorts.map((sort) =>
    sort.fieldId === fieldId
      ? { ...sort, direction: sort.direction === "asc" ? "desc" : "asc" }
      : sort
  );
}

/** Sorts without a field's entry; `undefined` when none remain. */
export function withoutSort(
  sorts: readonly DatabaseSort[],
  fieldId: string
): DatabaseSort[] | undefined {
  const next = sorts.filter((sort) => sort.fieldId !== fieldId);
  return next.length > 0 ? next : undefined;
}

/**
 * Sorts after clicking a column-menu sort item (add/toggle semantics): not
 * sorted → append at the end (lowest priority); already sorted in that
 * direction → remove the entry; sorted the other way → flip in place.
 */
export function toggledSorts(
  sorts: readonly DatabaseSort[] | undefined,
  fieldId: string,
  direction: DatabaseSort["direction"]
): DatabaseSort[] | undefined {
  const base = sorts ?? [];
  const existing = sortEntryFor(base, fieldId);
  if (!existing) {
    return [...base, { fieldId, direction }];
  }
  if (existing.direction === direction) {
    return withoutSort(base, fieldId);
  }
  return flippedSortDirection(base, fieldId);
}

/**
 * Sorts with a field's entry moved one step in priority (`-1` = higher,
 * `+1` = lower). Out-of-range moves and unknown fields return the list
 * unchanged.
 */
export function movedSort(
  sorts: readonly DatabaseSort[],
  fieldId: string,
  delta: -1 | 1
): DatabaseSort[] {
  const index = sorts.findIndex((sort) => sort.fieldId === fieldId);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= sorts.length) {
    return [...sorts];
  }
  const next = [...sorts];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
