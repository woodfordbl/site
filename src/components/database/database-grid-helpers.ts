import type {
  DatabaseAggregateFn,
  DatabaseField,
  DatabaseTableViewConfig,
} from "@/lib/schemas/database.ts";

/**
 * Pure helpers for the database table grid: column sizing/resizing, header
 * drag-reorder planning, inline-edit navigation, and cell-editor value
 * parsing. React-free so they stay unit testable.
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

/** Clamp a dragged column width: whole pixels, never below the grid minimum. */
export function clampColumnWidthPx(widthPx: number): number {
  return Math.max(MIN_COLUMN_WIDTH_PX, Math.round(widthPx));
}

/** View config with one column width set (clamped); other keys untouched. */
export function configWithColumnWidth(
  config: DatabaseTableViewConfig,
  fieldId: string,
  widthPx: number
): DatabaseTableViewConfig {
  return {
    ...config,
    columnWidths: {
      ...config.columnWidths,
      [fieldId]: clampColumnWidthPx(widthPx),
    },
  };
}

/**
 * View config with one column's stored width removed (the double-click
 * "reset width" action — the column falls back to the default width).
 * Returns `null` when the field has no stored width, so callers can skip
 * the persistence write entirely.
 */
export function configWithoutColumnWidth(
  config: DatabaseTableViewConfig,
  fieldId: string
): DatabaseTableViewConfig | null {
  const widths = config.columnWidths;
  if (!(widths && fieldId in widths)) {
    return null;
  }
  const remaining = Object.fromEntries(
    Object.entries(widths).filter(([key]) => key !== fieldId)
  );
  return {
    ...config,
    columnWidths: Object.keys(remaining).length > 0 ? remaining : undefined,
  };
}

/** Full view state written on a header drag-reorder drop. */
export interface ColumnReorderPlan {
  /** Complete display-order field id list (pinned prefix included). */
  columnOrder: string[];
  /** Pinned prefix of `columnOrder` after applying the pin-boundary rule. */
  pinnedFieldIds: string[];
}

/**
 * Plan a header drag-reorder drop: rebuild the full display-order id list
 * with the source column inserted before/after the target, and re-derive the
 * pinned set from the freeze boundary.
 *
 * Pin-boundary rule: pinned columns are exactly the display-order prefix, so
 * dropping a column strictly **left** of the freeze boundary pins it,
 * dropping strictly **right** unpins it, and dropping exactly **on** the
 * boundary keeps the column's current pin state (so picking a column up and
 * putting it back never silently toggles pinning).
 *
 * Returns `null` for no-op drops (same position, source === target, unknown
 * ids) so callers can skip the persistence write.
 */
export function planColumnReorder(args: {
  /** Current display order: pinned fields first, then scrolling fields. */
  displayFieldIds: readonly string[];
  edge: "before" | "after";
  /** Length of the pinned prefix in `displayFieldIds`. */
  pinnedCount: number;
  sourceFieldId: string;
  targetFieldId: string;
}): ColumnReorderPlan | null {
  const { displayFieldIds, edge, pinnedCount, sourceFieldId, targetFieldId } =
    args;
  if (sourceFieldId === targetFieldId) {
    return null;
  }
  const sourceIndex = displayFieldIds.indexOf(sourceFieldId);
  if (sourceIndex === -1) {
    return null;
  }

  const withoutSource = displayFieldIds.filter((id) => id !== sourceFieldId);
  let insertIndex = withoutSource.indexOf(targetFieldId);
  if (insertIndex === -1) {
    return null;
  }
  if (edge === "after") {
    insertIndex += 1;
  }

  const columnOrder = [
    ...withoutSource.slice(0, insertIndex),
    sourceFieldId,
    ...withoutSource.slice(insertIndex),
  ];

  const sourceWasPinned = sourceIndex < pinnedCount;
  // Freeze boundary within `withoutSource`: the count of pinned columns left
  // after lifting the source out.
  const remainingPinned = sourceWasPinned ? pinnedCount - 1 : pinnedCount;
  let sourcePinned: boolean;
  if (insertIndex < remainingPinned) {
    sourcePinned = true;
  } else if (insertIndex > remainingPinned) {
    sourcePinned = false;
  } else {
    sourcePinned = sourceWasPinned;
  }
  const nextPinnedCount = remainingPinned + (sourcePinned ? 1 : 0);

  const unchanged =
    nextPinnedCount === pinnedCount &&
    columnOrder.every((id, index) => id === displayFieldIds[index]);
  if (unchanged) {
    return null;
  }

  return { columnOrder, pinnedFieldIds: columnOrder.slice(0, nextPinnedCount) };
}

/** One header cell's drop geometry, in display order. */
export interface ColumnDropZoneRect {
  fieldId: string;
  left: number;
  /** Pinned (sticky) headers win rect overlaps against scrolled-under ones. */
  pinned: boolean;
  right: number;
}

/** Candidate drop boundary for the column drag: a column edge. */
export interface ColumnDropSpot {
  edge: "before" | "after";
  fieldId: string;
}

/**
 * Resolve the column drop boundary from the pointer's x position alone (the
 * drop line spans the full grid height, so y never matters). Pinned headers
 * are checked first: they render sticky above scrolled columns, so when
 * rects overlap the visually-on-top pinned column wins. A pointer outside
 * every rect snaps to the nearest end of the header row.
 */
export function resolveColumnDropSpot(
  rects: readonly ColumnDropZoneRect[],
  pointerX: number
): ColumnDropSpot | null {
  if (rects.length === 0) {
    return null;
  }

  const contains = (rect: ColumnDropZoneRect) =>
    pointerX >= rect.left && pointerX < rect.right;
  const hit =
    rects.find((rect) => rect.pinned && contains(rect)) ??
    rects.find((rect) => !rect.pinned && contains(rect));
  if (hit) {
    const edge = pointerX < (hit.left + hit.right) / 2 ? "before" : "after";
    return { fieldId: hit.fieldId, edge };
  }

  const first = rects[0];
  const last = rects.at(-1) ?? first;
  return pointerX < first.left
    ? { fieldId: first.fieldId, edge: "before" }
    : { fieldId: last.fieldId, edge: "after" };
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
