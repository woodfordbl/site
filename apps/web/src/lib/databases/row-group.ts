import {
  cellToPlainText,
  coerceCellValue,
  formatCellValue,
  isCellEmpty,
  toIsoDatePart,
} from "@/lib/databases/cell-values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseView,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";

/**
 * Pure row grouping for grouped table views (`view.groupBy`): stable bucket
 * keys per field type, bucket ordering, and display labels/colors. Grouping
 * runs AFTER filter + sort — input rows arrive view-processed and each
 * bucket preserves the incoming intra-group order, so grouped views render
 * sorted-or-manual order within buckets exactly as given (drag-reorder
 * across/within groups is out of scope for v1).
 */

/** Case-insensitive text collation matching `row-sort`'s comparator. */
const TEXT_COLLATOR = new Intl.Collator("en-US", { sensitivity: "base" });

/** One rendered row bucket for a grouped view, in display order. */
export interface DatabaseRowGroup {
  /** Select-option color for the header dot; unset for colorless buckets. */
  color?: BlockColor;
  /** Stable bucket key (`groupKeyForRow`); `""` is the empty-value group. */
  key: string;
  /** Header label: option name / formatted value, or "No <field>" for empty. */
  label: string;
  /** Rows in the bucket, preserving the input (filtered + sorted) order. */
  rows: LocalDatabaseRow[];
  /**
   * The bucket's cell value, writable to `row.values[groupBy.fieldId]` (the
   * per-group add-row seeds new rows with it). `null` for the empty group.
   */
  value: DatabaseCellValue;
}

/**
 * Whether a field can drive `view.groupBy`. Formula fields are excluded in
 * v1 — their values are computed at read time and have no stable stored
 * bucket key. Relation fields are excluded too: bucket labels would need
 * cross-database title resolution that this pure module can't reach.
 */
export function isGroupableField(field: DatabaseField): boolean {
  return field.type !== "formula" && field.type !== "relation";
}

/**
 * Resolve a view's `groupBy` to a groupable field, or `null` when the view
 * is ungrouped, the field id is stale, or the field type isn't groupable.
 * Callers gate grouped rendering on this before calling `groupRowsForView`.
 */
export function resolveGroupByField(
  fields: readonly DatabaseField[],
  view: DatabaseView
): DatabaseField | null {
  const fieldId = view.groupBy?.fieldId;
  if (fieldId === undefined) {
    return null;
  }
  const field = fields.find((entry) => entry.id === fieldId);
  return field && isGroupableField(field) ? field : null;
}

/** Selected multi-select ids normalized to field option order (stale ids last). */
function normalizedOptionIds(
  field: DatabaseField & { type: "multiSelect" },
  optionIds: readonly string[]
): string[] {
  const known: { id: string; index: number }[] = [];
  const unknown: string[] = [];
  for (const optionId of optionIds) {
    const index = field.options.findIndex((option) => option.id === optionId);
    if (index === -1) {
      unknown.push(optionId);
    } else {
      known.push({ id: optionId, index });
    }
  }
  known.sort((a, b) => a.index - b.index);
  return [...known.map((entry) => entry.id), ...unknown];
}

/**
 * Stable bucket key for one row's cell under the group-by field: `""` for
 * empty; select → option id; multi-select → option ids in field option order
 * joined with `,` (one bucket per distinct combination); checkbox →
 * `"true"`/`"false"`; text/url → trimmed value; number → `String(value)`;
 * date → the ISO `yyyy-mm-dd` part. Formula fields (never groupable) key to
 * `""`. Keys are what `view.config.collapsedGroupKeys` stores.
 */
export function groupKeyForRow(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): string {
  const coerced = coerceCellValue(field, value);
  if (isCellEmpty(coerced)) {
    return "";
  }
  switch (field.type) {
    case "text":
    case "url":
      return typeof coerced === "string" ? coerced.trim() : "";
    case "number":
      return typeof coerced === "number" ? String(coerced) : "";
    case "checkbox":
      return coerced === true ? "true" : "false";
    case "select":
      return typeof coerced === "string" ? coerced : "";
    case "multiSelect":
      return Array.isArray(coerced)
        ? normalizedOptionIds(field, coerced).join(",")
        : "";
    case "date":
      return typeof coerced === "string" ? toIsoDatePart(coerced) : "";
    default:
      return "";
  }
}

interface GroupBucket {
  color?: BlockColor;
  key: string;
  label: string;
  rows: LocalDatabaseRow[];
  value: DatabaseCellValue;
}

/** The canonical cell value a bucket key represents (written by add-in-group). */
function bucketValue(field: DatabaseField, key: string): DatabaseCellValue {
  switch (field.type) {
    case "number":
      return Number(key);
    case "checkbox":
      return key === "true";
    case "multiSelect":
      return key.split(",");
    default:
      // text/url/select/date keys ARE the stored value.
      return key;
  }
}

/** Display label for a non-empty bucket (option name / formatted value). */
function bucketLabel(field: DatabaseField, key: string): string {
  if (field.type === "select") {
    const option = field.options.find((entry) => entry.id === key);
    // Stale option id (option deleted): the raw id stays an honest,
    // distinguishable label — plain-text projection would render "".
    return option?.name ?? key;
  }
  if (field.type === "multiSelect") {
    const label = cellToPlainText(field, bucketValue(field, key));
    return label === "" ? key : label;
  }
  return formatCellValue(field, bucketValue(field, key));
}

/** Select-option color for a bucket's header dot (select buckets only). */
function bucketColor(
  field: DatabaseField,
  key: string
): BlockColor | undefined {
  if (field.type !== "select") {
    return;
  }
  return field.options.find((entry) => entry.id === key)?.color;
}

/** Index of a select bucket's option in the field's option list, -1 if stale. */
function selectOptionIndex(field: DatabaseField, key: string): number {
  if (field.type !== "select") {
    return -1;
  }
  return field.options.findIndex((option) => option.id === key);
}

/**
 * Bucket ordering for non-empty groups: select by the field's option order
 * with unknown (stale) ids after, checkbox true-first, numbers numerically,
 * dates lexically on the ISO key, text/url/multi-select by collated label.
 */
function compareBuckets(
  field: DatabaseField,
  a: GroupBucket,
  b: GroupBucket
): number {
  switch (field.type) {
    case "select": {
      const aIndex = selectOptionIndex(field, a.key);
      const bIndex = selectOptionIndex(field, b.key);
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if ((aIndex === -1) !== (bIndex === -1)) {
        return aIndex === -1 ? 1 : -1;
      }
      return TEXT_COLLATOR.compare(a.key, b.key);
    }
    case "checkbox":
      return (a.key === "true" ? 0 : 1) - (b.key === "true" ? 0 : 1);
    case "number":
      return Number(a.key) - Number(b.key);
    case "date":
      if (a.key < b.key) {
        return -1;
      }
      return a.key > b.key ? 1 : 0;
    default:
      return TEXT_COLLATOR.compare(a.label, b.label);
  }
}

/**
 * Bucket already-filtered, already-sorted view rows by the view's `groupBy`
 * field. Buckets are ordered per `compareBuckets` with the empty-value group
 * always LAST, labeled "No <field name>"; rows keep their incoming order
 * within each bucket. Returns `[]` when the view has no resolvable groupable
 * group-by field (use `resolveGroupByField` to gate grouped rendering).
 */
export function groupRowsForView(
  rows: readonly LocalDatabaseRow[],
  fields: readonly DatabaseField[],
  view: DatabaseView
): DatabaseRowGroup[] {
  const field = resolveGroupByField(fields, view);
  if (!field) {
    return [];
  }

  const buckets = new Map<string, GroupBucket>();
  for (const row of rows) {
    const key = groupKeyForRow(field, row.values[field.id]);
    const existing = buckets.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    if (key === "") {
      buckets.set(key, {
        key,
        label: `No ${field.name}`,
        rows: [row],
        value: null,
      });
      continue;
    }
    buckets.set(key, {
      key,
      label: bucketLabel(field, key),
      color: bucketColor(field, key),
      rows: [row],
      value: bucketValue(field, key),
    });
  }

  const emptyGroup = buckets.get("");
  const nonEmpty = [...buckets.values()].filter((bucket) => bucket.key !== "");
  nonEmpty.sort((a, b) => compareBuckets(field, a, b));
  return emptyGroup ? [...nonEmpty, emptyGroup] : nonEmpty;
}
