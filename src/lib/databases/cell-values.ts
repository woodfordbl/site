import { format } from "date-fns/format";
import { formatDistance } from "date-fns/formatDistance";
import type {
  DatabaseCellValue,
  DatabaseDateFormat,
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
    case "multiSelect":
    case "relation": {
      // Relation cells store target-row id arrays — same shape as
      // multi-select option ids.
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
    case "relation":
      // Title projection needs the TARGET database's rows, which a pure
      // per-field function can't reach — relation cells project to "" in v1
      // (search/countUnique/group labels don't see relation titles). A later
      // stage may thread a cross-database title resolver here.
      return "";
    default:
      return "";
  }
}

/**
 * Plain text for a coerced (scalar) formula cell: strings as-is, numbers via
 * `String`, booleans "Yes"/"No" (matching checkbox and the formula display
 * convention in `lib/formula`).
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
 * Base `Intl.NumberFormat` options per number format. Percent follows `Intl`
 * semantics: the stored number is a fraction (0.42 → "42%"). `decimals`
 * (when set) pins min+max fraction digits over the format's natural
 * precision — for percent that means the digits AFTER the ×100 scaling;
 * currency stays USD. `useGrouping: false` drops thousands separators
 * (absent = on) in every format.
 */
function numberFormatOptions(
  format: DatabaseNumberFormat,
  decimals: number | undefined,
  useGrouping: boolean
): Intl.NumberFormatOptions {
  const options: Intl.NumberFormatOptions = { useGrouping };
  if (format === "integer") {
    options.maximumFractionDigits = 0;
  } else if (format === "percent") {
    options.style = "percent";
    options.maximumFractionDigits = 2;
  } else if (format === "currency") {
    options.style = "currency";
    options.currency = "USD";
  }
  if (decimals !== undefined) {
    options.minimumFractionDigits = decimals;
    options.maximumFractionDigits = decimals;
  }
  return options;
}

/**
 * Module-scope formatter cache keyed by the option tuple —
 * `Intl.NumberFormat` construction is expensive relative to `format` calls
 * (same convention as the previous static formatter table). The key space is
 * tiny and bounded: 4 formats × 8 decimals states × 2 grouping states.
 */
const NUMBER_FORMATTER_CACHE = new Map<string, Intl.NumberFormat>();

function numberFormatterFor(
  field: DatabaseField & { type: "number" }
): Intl.NumberFormat {
  const format = field.format ?? "plain";
  const useGrouping = field.useGrouping !== false;
  const key = `${format}|${field.decimals ?? "auto"}|${useGrouping ? "group" : "plain"}`;
  let formatter = NUMBER_FORMATTER_CACHE.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(
      "en-US",
      numberFormatOptions(format, field.decimals, useGrouping)
    );
    NUMBER_FORMATTER_CACHE.set(key, formatter);
  }
  return formatter;
}

/** date-fns patterns for the absolute date display formats. */
const DATE_DISPLAY_PATTERNS: Record<"default" | "long", string> = {
  default: "MMM d, yyyy",
  long: "MMMM d, yyyy",
};

/** Options for {@link formatCellValue}. */
export interface FormatCellValueOptions {
  /**
   * Injected clock for `relative` date fields; omit for real time. Mirrors
   * the formula engine's injected-clock convention
   * (`ComputeFormulaOverlayOptions.now`) so tests stay deterministic.
   */
  now?: () => Date;
}

function formatIsoDate(
  value: string,
  dateFormat: DatabaseDateFormat,
  opts?: FormatCellValueOptions
): string {
  const datePart = toIsoDatePart(value);
  if (datePart === "") {
    return "";
  }
  if (dateFormat === "iso") {
    return datePart;
  }
  const [year, month, day] = datePart.split("-").map(Number);
  // Construct in local time from date parts so the rendered day never shifts
  // across timezones (new Date("yyyy-mm-dd") would parse as UTC midnight).
  const date = new Date(year, month - 1, day);
  if (dateFormat === "relative") {
    // `formatDistanceToNow` minus the hardwired clock: identical output,
    // with the base instant injectable via `opts.now`. Cells re-render on
    // the table view's visible clock tick so the text keeps up with time.
    return formatDistance(date, opts?.now?.() ?? new Date(), {
      addSuffix: true,
    });
  }
  return format(date, DATE_DISPLAY_PATTERNS[dateFormat]);
}

/**
 * Display formatting for a cell: numbers honor the field's number format
 * (plain/integer/percent/currency, en-US) plus its `decimals` (fixed
 * fraction digits) and `useGrouping` (thousands separators, absent = on)
 * config; dates render per the field's date format (`default` "Mar 5, 2026",
 * `long` "March 5, 2026", `relative` "3 days ago" against `opts.now`, `iso`
 * the stored yyyy-mm-dd part); everything else falls back to
 * `cellToPlainText`. Display-only — stored values are never touched.
 */
export function formatCellValue(
  field: DatabaseField,
  value: DatabaseCellValue | undefined,
  opts?: FormatCellValueOptions
): string {
  const coerced = coerceCellValue(field, value);
  if (coerced === null) {
    return "";
  }
  if (field.type === "number" && typeof coerced === "number") {
    return numberFormatterFor(field).format(coerced);
  }
  if (field.type === "date" && typeof coerced === "string") {
    return formatIsoDate(coerced, field.format ?? "default", opts);
  }
  return cellToPlainText(field, coerced);
}
