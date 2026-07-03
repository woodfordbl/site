import type {
  DatabaseAggregateFn,
  DatabaseField,
  DatabaseTableViewConfig,
} from "@/lib/schemas/database.ts";

/**
 * Pure helpers for the database table grid: column sizing, inline-edit
 * navigation, and cell-editor value parsing. React-free so they stay unit
 * testable.
 */

/** Default column width when the view config has no stored width. */
export const DEFAULT_COLUMN_WIDTH_PX = 192;

/** Narrowest a column can render, regardless of stored width. */
export const MIN_COLUMN_WIDTH_PX = 96;

/** Fixed grid row height (header, body, and footer rows). */
export const GRID_ROW_HEIGHT_PX = 36;

/** Resolved render metadata for one grid column, in display order. */
export interface GridColumn {
  field: DatabaseField;
  /** Last left-pinned column — carries the freeze-boundary edge border. */
  isLastPinned: boolean;
  /** Sticky `left` offset in px when pinned, `null` otherwise. */
  left: number | null;
  pinned: boolean;
  width: number;
  /** Cell content wraps (clamped to two lines) instead of truncating. */
  wrap: boolean;
}

/** Column width from the view config, clamped to the grid minimum. */
export function resolveColumnWidthPx(
  config: DatabaseTableViewConfig,
  fieldId: string
): number {
  const width = config.columnWidths?.[fieldId] ?? DEFAULT_COLUMN_WIDTH_PX;
  return Math.max(MIN_COLUMN_WIDTH_PX, width);
}

/**
 * Whether a field type routes through `DatabaseCellInlineEditor` when its
 * cell is clicked in edit mode: text/url/number take the input overlay,
 * select/multi-select/date open popover editors. Checkbox is the exception —
 * it toggles in place with no editing state.
 */
export function isInlineEditableField(field: DatabaseField): boolean {
  return field.type !== "checkbox";
}

/** One editing cell, addressed by stable row + field ids. */
export interface CellEditTarget {
  fieldId: string;
  rowId: string;
}

/** Edit-focus movement: Tab, Shift+Tab, and Enter respectively. */
export type CellEditMove = "next" | "previous" | "down";

/**
 * Next inline-edit target after a Tab/Shift+Tab/Enter move. `next`/`previous`
 * step through the row's editable cells and wrap onto the neighboring row;
 * `down` keeps the field and advances one row. Returns `null` when the move
 * runs off the grid (editing stops).
 */
export function nextEditTarget(
  rowIds: readonly string[],
  editableFieldIds: readonly string[],
  from: CellEditTarget,
  move: CellEditMove
): CellEditTarget | null {
  const rowIndex = rowIds.indexOf(from.rowId);
  const fieldIndex = editableFieldIds.indexOf(from.fieldId);
  if (rowIndex === -1 || fieldIndex === -1) {
    return null;
  }

  if (move === "down") {
    const nextRowId = rowIds[rowIndex + 1];
    return nextRowId ? { rowId: nextRowId, fieldId: from.fieldId } : null;
  }

  const step = move === "next" ? 1 : -1;
  const flatIndex = rowIndex * editableFieldIds.length + fieldIndex + step;
  if (flatIndex < 0 || flatIndex >= rowIds.length * editableFieldIds.length) {
    return null;
  }

  return {
    rowId: rowIds[Math.floor(flatIndex / editableFieldIds.length)],
    fieldId: editableFieldIds[flatIndex % editableFieldIds.length],
  };
}

/**
 * Parse a number-cell editor's raw input: blank commits an empty cell
 * (`null`), unparseable input also collapses to `null` rather than storing
 * garbage.
 */
export function parseNumberCellInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const ISO_DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a `yyyy-mm-dd` date part into a local-time `Date` for the calendar
 * editor (constructing from parts so the rendered day never shifts across
 * timezones). Anything else returns `null`.
 */
export function isoDateToLocalDate(datePart: string): Date | null {
  const match = ISO_DATE_INPUT_RE.exec(datePart);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Href for a url cell — bare domains get an `https://` scheme prefixed. */
export function urlCellHref(value: string): string {
  const trimmed = value.trim();
  return ABSOLUTE_URL_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const AGGREGATE_FN_LABELS: Record<DatabaseAggregateFn, string> = {
  countAll: "Count all",
  countValues: "Count values",
  countUnique: "Count unique",
  countEmpty: "Count empty",
  countNotEmpty: "Count not empty",
  percentEmpty: "Percent empty",
  percentNotEmpty: "Percent not empty",
  sum: "Sum",
  average: "Average",
  median: "Median",
  min: "Min",
  max: "Max",
  range: "Range",
  earliest: "Earliest",
  latest: "Latest",
};

/** Sentence-case label for a Calculate-row aggregate ("Sum 42"). */
export function aggregateFnLabel(fn: DatabaseAggregateFn): string {
  return AGGREGATE_FN_LABELS[fn];
}
