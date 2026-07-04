import { format } from "date-fns/format";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseNumberFormat,
  DatabaseSelectOption,
} from "@/lib/schemas/database.ts";

/**
 * Pure cell-value helpers: emptiness, defensive coercion to the field's
 * expected shape, and plain-text / display formatting. All functions accept
 * arbitrary `DatabaseCellValue` input so stale or mistyped row data can never
 * throw in render or query paths.
 */

const ISO_DATE_PART_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Whether a cell holds no value: `null`/missing, blank string, or empty
 * array. Numbers (including 0) and booleans (including false) are values.
 */
export function isCellEmpty(value: DatabaseCellValue | undefined): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

/**
 * Normalize a raw ISO-ish date string to its `yyyy-mm-dd` date part.
 * Non-parseable input returns `""`. Used for lexical date comparison in
 * filters and sorts.
 */
export function toIsoDatePart(value: string): string {
  const trimmed = value.trim();
  const match = ISO_DATE_PART_RE.exec(trimmed);
  if (match) {
    return match[0];
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  // `Date` parses non-ISO strings ("12/31/2024", "Dec 31, 2024") in LOCAL
  // time, so read the date parts back in local time too — `toISOString()`
  // converts to UTC and would shift the calendar day for users east of UTC.
  const year = String(parsed.getFullYear()).padStart(4, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Coerce a merged (read-time computed) formula cell — see
 * `lib/databases/formula-values.ts`. Computed values are scalar
 * string/number/boolean; anything else (the in-memory error marker array,
 * stale stored values from a previous field type) reads as empty.
 */
function coerceFormulaValue(value: DatabaseCellValue): DatabaseCellValue {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/**
 * Defensively coerce a stored cell value into the shape the field type
 * expects. Wrong-shaped values (e.g. a string in a number field, an option-id
 * array in a single select) collapse to `null` — never thrown, never leaked
 * to comparators. Valid values pass through normalized.
 */
export function coerceCellValue(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): DatabaseCellValue {
  if (value === null || value === undefined) {
    return null;
  }
  switch (field.type) {
    case "text":
    case "url":
    case "select":
      return typeof value === "string" ? value : null;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    case "checkbox":
      return typeof value === "boolean" ? value : null;
    case "multiSelect": {
      if (!Array.isArray(value)) {
        return null;
      }
      return value.every((entry) => typeof entry === "string") ? value : null;
    }
    case "date": {
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      return toIsoDatePart(trimmed) === "" ? null : trimmed;
    }
    case "formula":
      return coerceFormulaValue(value);
    default:
      return null;
  }
}

function optionName(
  options: readonly DatabaseSelectOption[],
  optionId: string
): string {
  for (const option of options) {
    if (option.id === optionId) {
      return option.name;
    }
  }
  // Stale option id (option was deleted) — render nothing rather than the id.
  return "";
}

/**
 * Plain-text projection of a cell for search, `countUnique`, and copy: option
 * ids resolve to option names (stale ids drop out), dates reduce to their ISO
 * date part, checkboxes read "Yes"/"No", empty cells read `""`.
 */
export function cellToPlainText(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): string {
  const coerced = coerceCellValue(field, value);
  if (coerced === null) {
    return "";
  }
  switch (field.type) {
    case "text":
    case "url":
      return typeof coerced === "string" ? coerced : "";
    case "number":
      return typeof coerced === "number" ? String(coerced) : "";
    case "checkbox":
      return coerced === true ? "Yes" : "No";
    case "select":
      return typeof coerced === "string"
        ? optionName(field.options, coerced)
        : "";
    case "multiSelect": {
      if (!Array.isArray(coerced)) {
        return "";
      }
      // Join names in FIELD OPTION ORDER, not stored (click) order —
      // mirroring `row-group.ts`'s normalizedOptionIds — so identical tag
      // sets project to identical text and countUnique/sort agree with
      // grouping. Stale ids (deleted options) drop out.
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
      return entries.map((entry) => entry.name).join(", ");
    }
    case "date":
      return typeof coerced === "string" ? toIsoDatePart(coerced) : "";
    case "formula":
      return formulaPlainText(coerced);
    default:
      return "";
  }
}

/**
 * Plain text for a coerced (scalar) formula cell: strings as-is, numbers via
 * `String`, booleans "Yes"/"No" (matching checkbox and the formula display
 * convention in `lib/expr`).
 */
function formulaPlainText(coerced: DatabaseCellValue): string {
  if (typeof coerced === "string") {
    return coerced;
  }
  if (typeof coerced === "number") {
    return String(coerced);
  }
  if (typeof coerced === "boolean") {
    return coerced ? "Yes" : "No";
  }
  return "";
}

/**
 * Shared number formatters, constructed once at module scope —
 * `Intl.NumberFormat` construction is expensive relative to `format` calls.
 * Percent follows `Intl` semantics: the stored number is a fraction
 * (0.42 → "42%").
 */
const NUMBER_FORMATTERS: Record<DatabaseNumberFormat, Intl.NumberFormat> = {
  plain: new Intl.NumberFormat("en-US"),
  integer: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }),
  percent: new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }),
  currency: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }),
};

const DATE_DISPLAY_PATTERN = "MMM d, yyyy";

function formatIsoDate(value: string): string {
  const datePart = toIsoDatePart(value);
  if (datePart === "") {
    return "";
  }
  const [year, month, day] = datePart.split("-").map(Number);
  // Construct in local time from date parts so the rendered day never shifts
  // across timezones (new Date("yyyy-mm-dd") would parse as UTC midnight).
  return format(new Date(year, month - 1, day), DATE_DISPLAY_PATTERN);
}

/**
 * Display formatting for a cell: numbers honor the field's number format
 * (plain/integer/percent/currency, en-US), dates render via date-fns
 * ("Mar 5, 2026"), everything else falls back to `cellToPlainText`.
 */
export function formatCellValue(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): string {
  const coerced = coerceCellValue(field, value);
  if (coerced === null) {
    return "";
  }
  if (field.type === "number" && typeof coerced === "number") {
    return NUMBER_FORMATTERS[field.format ?? "plain"].format(coerced);
  }
  if (field.type === "date" && typeof coerced === "string") {
    return formatIsoDate(coerced);
  }
  return cellToPlainText(field, coerced);
}
