import type { DatabaseRowGroup } from "@/lib/databases/row-group.ts";
import type {
  DatabaseAggregateFn,
  DatabaseField,
  DatabaseTableViewConfig,
  LocalDatabaseRow,
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

/**
 * Checkbox columns hold no text — only the header's field icon and the
 * centered checkbox — so they size to just the checkbox plus padding, used as
 * both their default width and their minimum (they don't need to grow).
 */
export const CHECKBOX_COLUMN_WIDTH_PX = 48;

/**
 * Leading row-selection checkbox / number lane (not a DatabaseField). Sized
 * to the `size-4` checkbox with modest centering — narrower than checkbox
 * field columns, which also need a header icon footprint.
 */
export const SELECTION_COLUMN_WIDTH_PX = 32;

/** Synthetic TanStack column id for the leading row-select column (index 0). */
export const ROW_SELECT_COLUMN_ID = "__rowSelect__";

/** Per-view row checkbox gutter/column display mode. */
export type RowSelectDisplay = "always" | "hover" | "number";

/** Resolved row-select display; absent view config defaults to hover. */
export function resolveRowSelectDisplay(
  config: Pick<DatabaseTableViewConfig, "rowSelectDisplay">
): RowSelectDisplay {
  return config.rowSelectDisplay ?? "hover";
}

/**
 * Gutter modes (`hover` / `number`) use hover-reveal or number/checkbox swap
 * in the leading lane; `always` shows checkboxes at rest. Layout (bleed,
 * peek, borders) is shared across all three modes.
 */

/** True when column index 0 is clipped on the left by the scroll viewport. */
export function isSelectColumnCoveredByClip(
  sentinelRect: Pick<DOMRect, "left" | "right">,
  viewportRect: Pick<DOMRect, "left">
): boolean {
  return sentinelRect.left < viewportRect.left;
}

/** Whether the floating peek overlay should show over scrolled data. */
export function shouldShowSelectColumnPeek(
  covered: boolean,
  pointerInLaneZone: boolean,
  hasAnyRowSelection: boolean
): boolean {
  return covered && (pointerInLaneZone || hasAnyRowSelection);
}

/** True when the pointer is in the leading select lane (viewport or peek overlay). */
export function isPointerInSelectLaneZone(
  pointerX: number | null,
  zoneRect: Pick<DOMRect, "left">,
  laneWidthPx: number = SELECTION_COLUMN_WIDTH_PX
): boolean {
  return pointerX !== null && pointerX <= zoneRect.left + laneWidthPx;
}

/** Select pins with data columns — never alone. */
export function isSelectColumnPinned(
  effectivePinnedFieldCount: number
): boolean {
  return effectivePinnedFieldCount > 0;
}

/** Inputs for scrollport bleed against a page panel or column boundary. */
export interface GridBleedLayoutInput {
  boundaryLeft: number;
  boundaryRight: number;
  gridWidth: number;
  hostLeft: number;
  hostWidthPx: number;
  selectionColumnWidth?: number;
}

/** Derived bleed metrics for gutter offset and horizontal overhang. */
export interface GridBleedLayoutMetrics {
  extraBleed: number;
  gutterBleed: number;
  leftBleedPx: number;
  paddedGridWidth: number;
  rightAvailPx: number;
  rightBleed: number;
}

/**
 * Pure bleed math for the database table scrollport: at least the select
 * lane width pulls left so the first data column aligns with the block edge;
 * extra bleed extends the clip boundary to the page/column container.
 */
export function resolveGridBleedMetrics(
  input: GridBleedLayoutInput
): GridBleedLayoutMetrics {
  const selectionColumnWidth =
    input.selectionColumnWidth ?? SELECTION_COLUMN_WIDTH_PX;
  const leftBleedPx = Math.max(
    selectionColumnWidth,
    Math.round(input.hostLeft - input.boundaryLeft)
  );
  const rightAvailPx = Math.max(
    0,
    Math.round(input.boundaryRight - (input.hostLeft + input.hostWidthPx))
  );
  const gutterBleed = leftBleedPx;
  const extraBleed = Math.max(0, gutterBleed - selectionColumnWidth);
  const paddedGridWidth = input.gridWidth + extraBleed;
  const rightBleed = Math.min(
    Math.max(0, paddedGridWidth - input.hostWidthPx - gutterBleed),
    rightAvailPx
  );
  return {
    extraBleed,
    gutterBleed,
    leftBleedPx,
    paddedGridWidth,
    rightAvailPx,
    rightBleed,
  };
}

/**
 * Sticky classes for the row-select column when it is pinned with data
 * columns. The lane stays transparent at rest; peek supplies the surface.
 */
export function selectColumnPinnedClass(selectColumnPinned: boolean): string {
  if (!selectColumnPinned) {
    return "";
  }
  return "sticky left-(--grid-bleed) z-10 border-r border-r-border";
}

/**
 * Layout width reserved for the leading select lane. Always
 * {@link SELECTION_COLUMN_WIDTH_PX}.
 */
export function rowSelectLeadingWidthPx(): number {
  return SELECTION_COLUMN_WIDTH_PX;
}

/**
 * Next selected-id list after a checkbox toggle. Shift+click selects the
 * inclusive range between `anchorRowId` and `rowId` in `visibleRowIds`
 * (unioned with the current selection); plain toggles add/remove one id.
 */
export function nextSelectedRowIds(
  current: readonly string[],
  options: {
    anchorRowId: string | null;
    checked: boolean;
    rowId: string;
    shiftKey: boolean;
    visibleRowIds: readonly string[];
  }
): readonly string[] {
  const { anchorRowId, checked, rowId, shiftKey, visibleRowIds } = options;
  if (shiftKey && anchorRowId) {
    const anchorIndex = visibleRowIds.indexOf(anchorRowId);
    const targetIndex = visibleRowIds.indexOf(rowId);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      const range = visibleRowIds.slice(start, end + 1);
      const next = new Set(current);
      for (const id of range) {
        next.add(id);
      }
      return [...next];
    }
  }
  if (checked) {
    return current.includes(rowId) ? current : [...current, rowId];
  }
  return current.filter((id) => id !== rowId);
}

/** Narrowest width a specific field's column may render/resize to. */
export function minColumnWidthPx(field: Pick<DatabaseField, "type">): number {
  return field.type === "checkbox"
    ? CHECKBOX_COLUMN_WIDTH_PX
    : MIN_COLUMN_WIDTH_PX;
}

/** A field's fallback column width when the view stores none. */
export function defaultColumnWidthPx(
  field: Pick<DatabaseField, "type">
): number {
  return field.type === "checkbox"
    ? CHECKBOX_COLUMN_WIDTH_PX
    : DEFAULT_COLUMN_WIDTH_PX;
}

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
  /**
   * Render this column's right border. False for the last column (the
   * add-field control sits flush against it) and for every column when the
   * view disables vertical separators; the freeze-boundary border on the
   * last pinned column is applied separately and always wins.
   */
  showVerticalLine: boolean;
  width: number;
  /** Cell content wraps (clamped to two lines) instead of truncating. */
  wrap: boolean;
}

/**
 * Column width from the view config, falling back to `defaultWidth` when the
 * view stores none and clamped to the column's minimum (`minWidth`); both
 * default to the general text-column values.
 */
export function resolveColumnWidthPx(
  config: DatabaseTableViewConfig,
  fieldId: string,
  minWidth: number = MIN_COLUMN_WIDTH_PX,
  defaultWidth: number = DEFAULT_COLUMN_WIDTH_PX
): number {
  const width = config.columnWidths?.[fieldId] ?? defaultWidth;
  return Math.max(minWidth, width);
}

/** Clamp a dragged column width: whole pixels, never below the column minimum. */
export function clampColumnWidthPx(
  widthPx: number,
  minWidth: number = MIN_COLUMN_WIDTH_PX
): number {
  return Math.max(minWidth, Math.round(widthPx));
}

/** View config with one column width set (clamped); other keys untouched. */
export function configWithColumnWidth(
  config: DatabaseTableViewConfig,
  fieldId: string,
  widthPx: number,
  minWidth: number = MIN_COLUMN_WIDTH_PX
): DatabaseTableViewConfig {
  return {
    ...config,
    columnWidths: {
      ...config.columnWidths,
      [fieldId]: clampColumnWidthPx(widthPx, minWidth),
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
 * Whether a field's values are written by the connector sync engine (it
 * carries the provider-side `sourceKey`). Synced fields are read-only in the
 * grid — the next sync pass would overwrite any local edit.
 */
export function isSyncedField(
  field: Pick<DatabaseField, "sourceKey">
): boolean {
  return field.sourceKey !== undefined;
}

/**
 * Whether a field routes through `DatabaseCellInlineEditor` when its cell is
 * clicked in edit mode: text/url/number take the input overlay,
 * select/multi-select/date open popover editors. Checkbox is the exception —
 * it toggles in place with no editing state. Formula cells are computed at
 * read time and strictly read-only (edit the expression via the column
 * menu). Synced fields (`sourceKey`) are never editable — this is the single
 * edit-mode gate, so excluded cells also drop out of keyboard Tab/Enter
 * navigation; view-mode rendering is unaffected.
 */
export function isInlineEditableField(field: DatabaseField): boolean {
  return (
    field.type !== "checkbox" &&
    field.type !== "formula" &&
    !isSyncedField(field)
  );
}

/** One virtualized grid item: a group header row or a data row. */
export type GridItem =
  | { kind: "groupHeader"; group: DatabaseRowGroup }
  | { kind: "row"; row: LocalDatabaseRow };

/**
 * Flatten a grouped view into the virtualizer's item list: each group
 * contributes its header followed by its rows, except collapsed groups
 * (`view.config.collapsedGroupKeys`) which contribute only the header.
 * Ungrouped views (`groups === null`) flatten to plain row items.
 */
export function flattenGridItems(
  groups: readonly DatabaseRowGroup[] | null,
  rows: readonly LocalDatabaseRow[],
  collapsedGroupKeys: readonly string[] | undefined
): GridItem[] {
  if (!groups) {
    return rows.map((row) => ({ kind: "row", row }));
  }
  const collapsed = new Set(collapsedGroupKeys);
  const items: GridItem[] = [];
  for (const group of groups) {
    items.push({ kind: "groupHeader", group });
    if (!collapsed.has(group.key)) {
      for (const row of group.rows) {
        items.push({ kind: "row", row });
      }
    }
  }
  return items;
}

/**
 * Virtualizer range with one extra row index pinned into it — the grid pins
 * the editing row so scrolling it past the overscan window never unmounts
 * the inline editor (whose uncommitted draft only commits on blur, which a
 * DOM removal does not fire). `-1` (nothing to pin) or an index already in
 * range returns the input array unchanged; otherwise the index is merged in
 * ascending order, since the virtualizer expects sorted indexes.
 */
export function withPinnedRowIndex(
  indexes: number[],
  pinnedIndex: number
): number[] {
  if (pinnedIndex < 0 || indexes.includes(pinnedIndex)) {
    return indexes;
  }
  const next = [...indexes, pinnedIndex];
  next.sort((a, b) => a - b);
  return next;
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
