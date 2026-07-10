import {
  IconArrowsDiagonal,
  IconChevronRight,
  IconFileText,
  IconPlus,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  defaultRangeExtractor,
  type Range,
  useVirtualizer,
} from "@tanstack/react-virtual";
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { DatabaseAddRow } from "@/components/database/database-add-row.tsx";
import { DatabaseCalculateRow } from "@/components/database/database-calculate-row.tsx";
import { DatabaseCellValueView } from "@/components/database/database-cell.tsx";
import {
  DatabaseCellInlineEditor,
  DatabaseCheckboxCellEditor,
} from "@/components/database/database-cell-editor.tsx";
import {
  DATABASE_COLUMN_DRAG_ATTRIBUTE,
  DatabaseColumnDnd,
  DatabaseColumnDragAutoScroll,
  DatabaseColumnDropIndicator,
  DatabaseColumnDropZone,
} from "@/components/database/database-column-dnd.tsx";
import { DatabaseColumnMenu } from "@/components/database/database-column-menu.tsx";
import { DatabaseColumnResizeZone } from "@/components/database/database-column-resize-zone.tsx";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import {
  type CellEditMove,
  type CellEditTarget,
  DEFAULT_COLUMN_WIDTH_PX,
  defaultColumnWidthPx,
  flattenGridItems,
  GRID_ROW_HEIGHT_PX,
  type GridColumn,
  type GridItem,
  isInlineEditableField,
  isSyncedField,
  MIN_COLUMN_WIDTH_PX,
  minColumnWidthPx,
  nextEditTarget,
  nextSelectedRowIds,
  type RowSelectDisplay,
  resolveColumnWidthPx,
  resolveRowSelectDisplay,
  rowSelectLeadingWidthPx,
  SELECTION_COLUMN_WIDTH_PX,
  usesRowSelectGutter,
  withPinnedRowIndex,
} from "@/components/database/database-grid-helpers.ts";
import { DatabaseGroupMenu } from "@/components/database/database-group-menu.tsx";
import { DatabaseRowMenu } from "@/components/database/database-row-menu.tsx";
import { useDatabaseColumnHeaderDrag } from "@/components/database/use-database-column-drag.ts";
import { useDatabaseColumnResize } from "@/components/database/use-database-column-resize.ts";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area.tsx";
import {
  addDatabaseField,
  insertDatabaseRow,
  updateDatabaseCell,
  updateDatabaseView,
} from "@/db/queries/database-collection-ops.ts";
import { BLOCK_COLOR_DEFS } from "@/lib/blocks/block-colors.ts";
import { createDatabaseField } from "@/lib/databases/field-defs.ts";
import { applyFilter } from "@/lib/databases/row-filter.ts";
import type { DatabaseRowGroup } from "@/lib/databases/row-group.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The table-view grid: TanStack Table in fully manual mode (core row model
 * only — rows arrive pre-filtered/pre-sorted from the view layer) with
 * TanStack Virtual row windowing inside one horizontal-scroll container.
 * Pinned columns render `position: sticky` from the view's `pinnedFieldIds`.
 *
 * Grouped views (`view.groupBy`) virtualize a flattened header+row item
 * list (`flattenGridItems`); buckets render the incoming sorted-or-manual
 * row order as given — drag-reorder across/within groups is out of scope.
 * The Calculate row still aggregates over ALL filtered rows, collapsed
 * groups included.
 */

/** Extra virtual rows above/below the viewport. */
const ROW_OVERSCAN = 12;

/** Vertical cap so row virtualization has a bounded scrollport. */
const GRID_MAX_HEIGHT_CLASS = "max-h-[600px]";

/**
 * The trailing edit-mode add-field control renders as a real (empty) column
 * just wide enough for the "+" header button (icon + minimal padding).
 */
const ADD_FIELD_CELL_WIDTH_PX = 28;

/** Scroll distance over which the pinned-edge fade ramps from 0 to 1. */
const PINNED_FADE_RAMP_PX = 24;

/**
 * Wrapped cells clamp to two lines inside the auto-height row (the
 * virtualizer measures real row heights via `measureElement`); unclamped
 * full wrapping is deferred until row heights get proper UX treatment.
 */
const WRAPPED_CELL_CONTENT_CLASS =
  "line-clamp-2 min-w-0 whitespace-normal break-words py-1.5 [&_span]:whitespace-normal";

/**
 * Stable empty pin list for auto-unpin — a fresh `[]` literal per render
 * would invalidate the `gridColumns` memo (and every memoized row under it)
 * on exactly the narrow viewports where pinning gets disabled.
 */
const EMPTY_PINNED_FIELDS: readonly DatabaseField[] = [];

/**
 * Classes for the grid's outer layout shells. Embedded hosts cap the
 * scrollport at {@link GRID_MAX_HEIGHT_CLASS}; `fillHeight` hosts (the
 * standalone database page) become a shrinkable flex column instead, so the
 * scrollport takes the remaining page height and the add-row strip pins
 * below it. Mobile keeps the embedded cap even there — the document scrolls
 * on narrow viewports, so there is no bounded height to fill.
 */
function resolveGridLayoutClasses(
  fillHeight: boolean,
  rowSelectGutter: boolean
): { dropZone: string; scrollArea: string; scrollWrap: string } {
  return {
    dropZone: cn(
      "w-full min-w-0 rounded-lg",
      // Gutter modes bleed the select lane into the canvas padding;
      // keep overflow visible so `-ml-12` is not clipped.
      rowSelectGutter ? "overflow-visible" : "overflow-hidden",
      fillHeight && "flex min-h-0 flex-1 flex-col"
    ),
    scrollWrap: cn(
      "relative",
      rowSelectGutter && "-ml-12",
      fillHeight && "flex min-h-0 flex-col"
    ),
    scrollArea: cn(
      "w-full overflow-hidden rounded-lg",
      GRID_MAX_HEIGHT_CLASS,
      fillHeight && "min-h-0 md:max-h-none"
    ),
  };
}

interface DatabaseTableGridProps {
  /** Visible fields in display order (`resolveColumnOrder`). */
  columns: readonly DatabaseField[];
  databaseId: string;
  /**
   * Full-page hosts (the `/db/$databaseId` route): the scrollport flexes to
   * the host's remaining height instead of the embedded 600px cap, so the
   * add-row strip pins to the bottom of the screen once rows overflow.
   * Mobile keeps the cap — the document scrolls there, so there is no
   * bounded height to fill.
   */
  fillHeight?: boolean;
  /**
   * Row buckets when the view has a resolvable `groupBy` (built by
   * `groupRowsForView` over the same filtered + sorted `rows`); `null`
   * renders the flat ungrouped grid. Collapsed groups render header-only.
   */
  groups?: readonly DatabaseRowGroup[] | null;
  /**
   * Connector-synced database: the "New row" strip is hidden (rows come from
   * the source). Local columns stay first-class — add-field remains enabled.
   */
  isSyncedDatabase?: boolean;
  mode: "view" | "edit";
  /**
   * The table view's visible display clock (ticks per minute only while a
   * volatile formula or a relative-format date column needs it). A changed
   * instant re-renders the memoized rows so relative dates keep up with time.
   */
  now: Date;
  /** Left-frozen fields in pin order (`resolvePinnedFields`). */
  pinnedFields: readonly DatabaseField[];
  primaryFieldId: string;
  /** Filtered + sorted rows for the active view. */
  rows: readonly LocalDatabaseRow[];
  view: DatabaseView;
}

/** Virtualized grid for one database table view. */
export function DatabaseTableGrid({
  columns,
  databaseId,
  fillHeight = false,
  groups = null,
  isSyncedDatabase = false,
  mode,
  now,
  pinnedFields,
  primaryFieldId,
  rows,
  view,
}: DatabaseTableGridProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const pinnedShadowRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState<CellEditTarget | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<readonly string[]>([]);
  const lastToggledRowIdRef = useRef<string | null>(null);

  // Divider resize: live pixel widths during a drag, committed to
  // `view.config.columnWidths` on pointer up.
  const { liveWidths, startResize } = useDatabaseColumnResize({
    databaseId,
    view,
  });

  // Scrollport width, live via ResizeObserver — pinning is disabled when the
  // frozen columns would swallow (nearly) the whole scrollport, which on
  // narrow/mobile viewports otherwise leaves every unfrozen column stuck
  // underneath the sticky ones and unreachable by horizontal scroll.
  const [scrollportWidth, setScrollportWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setScrollportWidth(element.clientWidth);
    });
    observer.observe(element);
    setScrollportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const rowSelectDisplay = resolveRowSelectDisplay(view.config);
  const rowSelectGutter = usesRowSelectGutter(rowSelectDisplay);
  const rowSelectLeadingWidth = rowSelectLeadingWidthPx();
  const layoutClasses = resolveGridLayoutClasses(fillHeight, rowSelectGutter);

  const pinnedTotalWidth = useMemo(
    () =>
      rowSelectLeadingWidth +
      pinnedFields.reduce(
        (total, field) =>
          total +
          resolveColumnWidthPx(
            view.config,
            field.id,
            minColumnWidthPx(field),
            defaultColumnWidthPx(field)
          ),
        0
      ),
    [pinnedFields, rowSelectLeadingWidth, view.config]
  );
  // Keep at least one minimum-width column of scrollable room; SSR/first
  // paint (width unknown) keeps the configured pinning for desktop parity.
  const pinningDisabled =
    scrollportWidth !== null &&
    pinnedTotalWidth > scrollportWidth - MIN_COLUMN_WIDTH_PX;
  const effectivePinnedFields = pinningDisabled
    ? EMPTY_PINNED_FIELDS
    : pinnedFields;

  // Column render metadata: width from the view config (clamped, overridden
  // by the live divider-drag width mid-resize), pinned columns first with
  // cumulative sticky offsets — the same math TanStack's `columnPinning`
  // state machine applies, kept memoized on the raw view inputs so memoized
  // rows only re-render when the schema/config changes.
  const gridColumns = useMemo<GridColumn[]>(() => {
    const pinnedIds = new Set(effectivePinnedFields.map((field) => field.id));
    const ordered = [
      ...effectivePinnedFields,
      ...columns.filter((field) => !pinnedIds.has(field.id)),
    ];
    const verticalLines = view.config.showVerticalLines !== false;
    // Pinned sticky offsets start after the leading selection column so
    // frozen fields sit flush against it.
    let offset = rowSelectLeadingWidth;
    return ordered.map((field, index) => {
      const width =
        liveWidths?.[field.id] ??
        resolveColumnWidthPx(
          view.config,
          field.id,
          minColumnWidthPx(field),
          defaultColumnWidthPx(field)
        );
      const pinned = index < pinnedIds.size;
      const column: GridColumn = {
        field,
        width,
        pinned,
        left: pinned ? offset : null,
        isLastPinned: pinned && index === pinnedIds.size - 1,
        showVerticalLine: verticalLines && index < ordered.length - 1,
        wrap: view.config.wrapFieldIds?.includes(field.id) ?? false,
      };
      if (pinned) {
        offset += width;
      }
      return column;
    });
  }, [
    columns,
    effectivePinnedFields,
    liveWidths,
    rowSelectLeadingWidth,
    view.config,
  ]);

  const displayFieldIds = useMemo(
    () => gridColumns.map((column) => column.field.id),
    [gridColumns]
  );

  const columnDefs = useMemo<ColumnDef<LocalDatabaseRow>[]>(
    () =>
      gridColumns.map((column) => ({
        id: column.field.id,
        size: column.width,
        minSize: minColumnWidthPx(column.field),
      })),
    [gridColumns]
  );

  const columnPinning = useMemo(
    () => ({ left: effectivePinnedFields.map((field) => field.id) }),
    [effectivePinnedFields]
  );

  // Fully manual mode: no sorted/filtered row models — data computation
  // happens upstream, the table only owns column state machines.
  const table = useReactTable({
    data: rows as LocalDatabaseRow[],
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    state: { columnPinning },
    defaultColumn: {
      size: DEFAULT_COLUMN_WIDTH_PX,
      minSize: MIN_COLUMN_WIDTH_PX,
    },
  });
  const totalWidth = table.getTotalSize() + rowSelectLeadingWidth;
  const gridWidth =
    mode === "edit" ? totalWidth + ADD_FIELD_CELL_WIDTH_PX : totalWidth;

  // Pinned-edge boundary in scrollport coordinates: the last frozen column's
  // right edge (pinned cells stick at these exact offsets, so the boundary is
  // viewport-stable regardless of scrollLeft). Tracks live divider drags via
  // `gridColumns` widths. The leading selection column is always frozen, so
  // its right edge is the minimum boundary even with no field pins.
  const pinnedEdgeLeft = useMemo(() => {
    const last = gridColumns.find((column) => column.isLastPinned);
    if (last && last.left !== null) {
      return last.left + last.width;
    }
    if (gridColumns.length === 0) {
      return null;
    }
    // Gutter modes: the select lane is a transparent overlay, so scrolled
    // content stays visible to the scrollport's left edge — fade there.
    return rowSelectGutter ? 0 : rowSelectLeadingWidth;
  }, [gridColumns, rowSelectGutter, rowSelectLeadingWidth]);

  // Pinned-edge fade: a rAF-throttled scroll listener writes the fade
  // opacity (0 at scrollLeft 0, ramping over PINNED_FADE_RAMP_PX, and only
  // while real horizontal overflow exists) onto the single full-height
  // `.database-grid-pinned-shadow` overlay — one gradient spanning header,
  // rows, and calculate row, so it cannot break at row borders the way a
  // per-cell box-shadow did.
  useEffect(() => {
    const element = scrollRef.current;
    const shadow = pinnedShadowRef.current;
    if (!(element && shadow && pinnedEdgeLeft !== null)) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const overflowing = gridWidth > element.clientWidth;
      const fade = overflowing
        ? Math.min(element.scrollLeft / PINNED_FADE_RAMP_PX, 1)
        : 0;
      shadow.style.opacity = String(fade);
      // Gutter select-lane reveal state: while horizontally scrolled the
      // transparent lane hides its controls (content shows through to the
      // page's left boundary) until the boundary strip is hovered — the
      // `in-data-[hscrolled]` variants on the lane cells key off this.
      element.toggleAttribute("data-hscrolled", element.scrollLeft > 0);
    };
    const handleScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update);
      }
    };
    update();
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", handleScroll);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [gridWidth, pinnedEdgeLeft]);

  const handleAddField = useCallback(() => {
    const field = createDatabaseField("text", "Text");
    addDatabaseField(databaseId, field);
    // A materialized visible list must adopt the new field explicitly.
    if (view.visibleFieldIds) {
      updateDatabaseView(databaseId, view.id, {
        visibleFieldIds: [...view.visibleFieldIds, field.id],
      });
    }
  }, [databaseId, view.id, view.visibleFieldIds]);

  // Grouped views virtualize a flattened header+row item list; collapsed
  // groups contribute only their header.
  const collapsedGroupKeys = view.config.collapsedGroupKeys;
  const collapsedKeySet = useMemo(
    () => new Set(collapsedGroupKeys),
    [collapsedGroupKeys]
  );
  const items = useMemo<GridItem[]>(
    () => flattenGridItems(groups, rows, collapsedGroupKeys),
    [collapsedGroupKeys, groups, rows]
  );

  const rowNumberById = useMemo(() => {
    const map = new Map<string, number>();
    let rowNumber = 0;
    for (const item of items) {
      if (item.kind === "row") {
        rowNumber += 1;
        map.set(item.row.id, rowNumber);
      }
    }
    return map;
  }, [items]);

  const handleToggleGroup = useCallback(
    (groupKey: string) => {
      const current = view.config.collapsedGroupKeys ?? [];
      const next = current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey];
      updateDatabaseView(databaseId, view.id, {
        config: {
          ...view.config,
          collapsedGroupKeys: next.length > 0 ? next : undefined,
        },
      });
    },
    [databaseId, view.config, view.id]
  );

  // Group header context menu actions (edit mode): collapse state batches,
  // and per-group hiding via `hiddenGroupKeys` (filtered out upstream in
  // `DatabaseTableView`; the menu and the Group submenu both restore).
  const hiddenGroupCount = view.config.hiddenGroupKeys?.length ?? 0;
  const handleCollapseAllGroups = useCallback(() => {
    updateDatabaseView(databaseId, view.id, {
      config: {
        ...view.config,
        collapsedGroupKeys: (groups ?? []).map((group) => group.key),
      },
    });
  }, [databaseId, groups, view.config, view.id]);
  const handleExpandAllGroups = useCallback(() => {
    updateDatabaseView(databaseId, view.id, {
      config: { ...view.config, collapsedGroupKeys: undefined },
    });
  }, [databaseId, view.config, view.id]);
  const handleHideGroup = useCallback(
    (groupKey: string) => {
      updateDatabaseView(databaseId, view.id, {
        config: {
          ...view.config,
          hiddenGroupKeys: [...(view.config.hiddenGroupKeys ?? []), groupKey],
        },
      });
    },
    [databaseId, view.config, view.id]
  );
  const handleShowHiddenGroups = useCallback(() => {
    updateDatabaseView(databaseId, view.id, {
      config: { ...view.config, hiddenGroupKeys: undefined },
    });
  }, [databaseId, view.config, view.id]);

  // Keep the editing row mounted even when scrolled past the overscan
  // window: the inline text editor holds its draft in local state and
  // commits on blur/Enter, and removing a focused element fires no blur —
  // letting the virtualizer unmount the row would silently drop the
  // uncommitted draft. Pinning the index into the range keeps the row
  // rendered at its true offset with no duplicate keys when it is already
  // in the window, and row memoization is untouched.
  const editingRowId = editing?.rowId ?? null;
  const editingItemIndex = useMemo(
    () =>
      editingRowId === null
        ? -1
        : items.findIndex(
            (item) => item.kind === "row" && item.row.id === editingRowId
          ),
    [editingRowId, items]
  );
  const rangeExtractor = useCallback(
    // A fresh callback identity when the editing index changes forces the
    // virtualizer to recompute its range (rangeExtractor is a memo dep).
    (range: Range) =>
      withPinnedRowIndex(defaultRangeExtractor(range), editingItemIndex),
    [editingItemIndex]
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GRID_ROW_HEIGHT_PX,
    overscan: ROW_OVERSCAN,
    rangeExtractor,
  });

  const editableFieldIds = useMemo(
    () =>
      gridColumns
        .filter((column) => isInlineEditableField(column.field))
        .map((column) => column.field.id),
    [gridColumns]
  );

  // Latest-values ref so the navigation callbacks stay referentially stable
  // (memoized rows never re-render from a callback identity change).
  const editStateRef = useRef<{
    editableFieldIds: readonly string[];
    rowIds: readonly string[];
  }>({ editableFieldIds: [], rowIds: [] });
  useEffect(() => {
    editStateRef.current = {
      editableFieldIds,
      // Visible (non-collapsed) rows only, so keyboard navigation skips
      // group headers and never lands inside a collapsed group.
      rowIds: items.flatMap((item) =>
        item.kind === "row" ? [item.row.id] : []
      ),
    };
  }, [editableFieldIds, items]);

  const handleStartEdit = useCallback((target: CellEditTarget) => {
    setEditing(target);
  }, []);

  const handleStopEdit = useCallback(() => {
    setEditing(null);
  }, []);

  const handleNavigate = useCallback(
    (move: CellEditMove, from: CellEditTarget) => {
      const state = editStateRef.current;
      setEditing(
        nextEditTarget(state.rowIds, state.editableFieldIds, from, move)
      );
    },
    []
  );

  /**
   * Focus a freshly inserted row's primary cell — unless the active filter
   * hides the row, in which case `editing` must NOT point at it (the row
   * never renders, so the editor would silently strand); clear the edit
   * state and say so instead. Visibility is predicted with the same
   * `applyFilter` the view layer uses, over the visible fields and the
   * row's post-seed values. Conditions on hidden fields count as matching
   * (applyFilter's own lenient unknown-field convention) and formula
   * overlays are not recomputed here, so a rare misprediction can leave
   * `editing` on a hidden row — benign: no editor mounts and the next
   * click recovers.
   */
  const focusInsertedRow = useCallback(
    (row: LocalDatabaseRow, values: LocalDatabaseRow["values"]) => {
      if (
        applyFilter([{ ...row, values }], columns, view.filter).length === 0
      ) {
        setEditing(null);
        toast.info("New row is hidden by the current filter");
        return;
      }
      if (editStateRef.current.editableFieldIds.includes(primaryFieldId)) {
        setEditing({ rowId: row.id, fieldId: primaryFieldId });
      }
    },
    [columns, primaryFieldId, view.filter]
  );

  const handleRowInserted = useCallback(
    (row: LocalDatabaseRow) => {
      // A blank row always buckets into the empty ("") group on grouped
      // views — expand it when collapsed, or the row (and its inline
      // editor) would land invisibly inside the collapsed bucket.
      if (groups !== null && collapsedKeySet.has("")) {
        handleToggleGroup("");
      }
      focusInsertedRow(row, row.values);
    },
    [collapsedKeySet, focusInsertedRow, groups, handleToggleGroup]
  );

  const visibleRowIds = useMemo(
    () => items.flatMap((item) => (item.kind === "row" ? [item.row.id] : [])),
    [items]
  );

  const selectedIdSet = useMemo(
    () => new Set(selectedRowIds),
    [selectedRowIds]
  );

  const allVisibleSelected =
    visibleRowIds.length > 0 &&
    visibleRowIds.every((rowId) => selectedIdSet.has(rowId));
  const someVisibleSelected =
    !allVisibleSelected &&
    visibleRowIds.some((rowId) => selectedIdSet.has(rowId));

  const handleToggleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedRowIds(visibleRowIds);
        lastToggledRowIdRef.current = visibleRowIds.at(-1) ?? null;
        return;
      }
      setSelectedRowIds([]);
      lastToggledRowIdRef.current = null;
    },
    [visibleRowIds]
  );

  const handleToggleRowSelected = useCallback(
    (rowId: string, checked: boolean, shiftKey: boolean) => {
      setSelectedRowIds((current) =>
        nextSelectedRowIds(current, {
          anchorRowId: lastToggledRowIdRef.current,
          checked,
          rowId,
          shiftKey,
          visibleRowIds,
        })
      );
      lastToggledRowIdRef.current = rowId;
    },
    [visibleRowIds]
  );

  const handleContextSelectRow = useCallback((rowId: string) => {
    setSelectedRowIds((current) => {
      if (current.includes(rowId)) {
        return current;
      }
      return [rowId];
    });
    lastToggledRowIdRef.current = rowId;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedRowIds([]);
    lastToggledRowIdRef.current = null;
  }, []);

  const groupByFieldId = view.groupBy?.fieldId;
  const handleAddRowToGroup = useCallback(
    (group: DatabaseRowGroup) => {
      // Insert after the group's last row so manual-order views keep the new
      // row inside the bucket; seed the group-by cell so sorted/grouped
      // views bucket it correctly (the empty group inserts a blank row).
      const lastRow = group.rows.at(-1);
      const row = insertDatabaseRow(databaseId, { after: lastRow?.id });
      let values = row.values;
      if (groupByFieldId !== undefined && group.value !== null) {
        updateDatabaseCell(row.id, groupByFieldId, group.value);
        // Filter visibility must be judged on the seeded cell value.
        values = { ...row.values, [groupByFieldId]: group.value };
      }
      // A collapsed bucket would swallow the new row invisibly — expand it.
      if (collapsedKeySet.has(group.key)) {
        handleToggleGroup(group.key);
      }
      focusInsertedRow(row, values);
    },
    [
      collapsedKeySet,
      databaseId,
      focusInsertedRow,
      groupByFieldId,
      handleToggleGroup,
    ]
  );

  // Scroll the editing cell into view — but only when the editing TARGET
  // changes (start edit, Tab/Enter navigation, fresh insert). `items`
  // identity also churns on background sync ticks and cross-tab writes;
  // re-firing scrollToIndex then would yank the viewport back mid-typing
  // after the user scrolled away (the editing row itself stays mounted via
  // the pinned range extractor above).
  const scrolledEditTargetRef = useRef<CellEditTarget | null>(null);
  useEffect(() => {
    if (!editing) {
      scrolledEditTargetRef.current = null;
      return;
    }
    const scrolled = scrolledEditTargetRef.current;
    if (
      scrolled &&
      scrolled.rowId === editing.rowId &&
      scrolled.fieldId === editing.fieldId
    ) {
      return;
    }
    // -1 (row not yet in items, e.g. an insert the live query hasn't
    // emitted) stays unmarked so the next items change retries the scroll.
    if (editingItemIndex >= 0) {
      virtualizer.scrollToIndex(editingItemIndex);
      scrolledEditTargetRef.current = editing;
    }
  }, [editing, editingItemIndex, virtualizer]);

  const calculations = view.config.calculations;
  const hasCalculations =
    calculations !== undefined && Object.keys(calculations).length > 0;

  const hasAnyRowSelection = selectedRowIds.length > 0;

  // Page icon in the primary (title) cells — a per-view toggle (⋯ menu),
  // shown unless explicitly disabled.
  const showPageIcon = view.config.showPageIcons !== false;

  return (
    // The DnD wrapper stays outside the scroll container (the table block's
    // hard-won wrapper-placement rule) so header sources, the drop zone, and
    // the overlay all share one surface.
    <DatabaseColumnDnd
      databaseId={databaseId}
      gridColumns={gridColumns}
      gridRef={gridRef}
      view={view}
    >
      <DatabaseColumnDropZone className={layoutClasses.dropZone}>
        {/* Positioning parent for the pinned-edge shadow: exactly the
            scrollport (header through calculate row), not the add-row strip
            below it. Gutter modes pull the scrollport left by the select
            lane width so the first data column stays flush with filters. */}
        <div className={layoutClasses.scrollWrap}>
          <ScrollArea
            className={layoutClasses.scrollArea}
            fadeEdges
            viewportRef={scrollRef}
          >
            {/* biome-ignore lint/a11y/useSemanticElements: virtualized sticky/pinned layout — a native <table> cannot express it. */}
            <div
              aria-colcount={gridColumns.length + 1}
              aria-rowcount={items.length + 1}
              className="relative"
              ref={gridRef}
              role="grid"
              style={{ width: gridWidth, minWidth: "100%" }}
            >
              {/* biome-ignore lint/a11y/useSemanticElements: div grid — see role="grid" note above. */}
              {/* biome-ignore lint/a11y/useFocusableInteractive: focus lives on the header menu triggers, not the row. */}
              <div
                aria-rowindex={1}
                className={cn(
                  "sticky top-0 z-20 flex bg-background",
                  // Gutter modes: border lives on data header cells so the
                  // select lane stays borderless (canvas-gutter look).
                  !rowSelectGutter && "border-border border-b-[0.5px]"
                )}
                role="row"
              >
                <GridSelectionHeaderCell
                  allSelected={allVisibleSelected}
                  onCheckedChange={handleToggleSelectAll}
                  rowSelectDisplay={rowSelectDisplay}
                  showControl={hasAnyRowSelection}
                  someSelected={someVisibleSelected}
                />
                {table.getHeaderGroups().map((headerGroup) =>
                  headerGroup.headers.map((header, headerIndex) => {
                    const column = gridColumns.find(
                      (entry) => entry.field.id === header.column.id
                    );
                    if (!column) {
                      return null;
                    }
                    const sort = view.sorts?.find(
                      (entry) => entry.fieldId === column.field.id
                    );
                    return (
                      <GridHeaderCell
                        ariaColIndex={headerIndex + 2}
                        column={column}
                        databaseId={databaseId}
                        displayFieldIds={displayFieldIds}
                        key={header.id}
                        mode={mode}
                        onResizeStart={startResize}
                        primaryFieldId={primaryFieldId}
                        rowSelectGutter={rowSelectGutter}
                        sortDirection={sort?.direction}
                        view={view}
                        width={header.getSize()}
                      />
                    );
                  })
                )}
                {mode === "edit" ? (
                  // A real, empty trailing column; its header is a normal
                  // header-style button (mirrors `GridHeaderCell`'s trigger).
                  <div
                    className={cn(
                      "relative isolate flex h-9 shrink-0 items-stretch overflow-hidden bg-background text-muted-foreground",
                      rowSelectGutter && "border-border border-b-[0.5px]"
                    )}
                    style={{ width: ADD_FIELD_CELL_WIDTH_PX }}
                  >
                    <button
                      aria-label="Add property"
                      className="flex size-full items-center justify-center outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
                      onClick={handleAddField}
                      type="button"
                    >
                      <IconPlus className="size-4 shrink-0 stroke-[1.5px]" />
                    </button>
                  </div>
                ) : null}
              </div>
              {items.length === 0 ? (
                <div className="flex h-9 items-center text-muted-foreground text-sm">
                  <div
                    aria-hidden
                    className="shrink-0"
                    style={{ width: SELECTION_COLUMN_WIDTH_PX }}
                  />
                  <span className="sticky left-2 px-2">No rows</span>
                </div>
              ) : (
                // biome-ignore lint/a11y/useSemanticElements: div grid — see role="grid" note above.
                <div
                  className="relative"
                  role="rowgroup"
                  style={{ height: virtualizer.getTotalSize() }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const item = items[virtualRow.index];
                    if (item.kind === "groupHeader") {
                      return (
                        <GridGroupHeaderRow
                          collapsed={collapsedKeySet.has(item.group.key)}
                          group={item.group}
                          hiddenGroupCount={hiddenGroupCount}
                          key={`group:${item.group.key}`}
                          measureRow={virtualizer.measureElement}
                          onAddRow={handleAddRowToGroup}
                          onCollapseAll={handleCollapseAllGroups}
                          onExpandAll={handleExpandAllGroups}
                          onHideGroup={handleHideGroup}
                          onShowHiddenGroups={handleShowHiddenGroups}
                          onToggle={handleToggleGroup}
                          rowIndex={virtualRow.index}
                          rowSelectGutter={rowSelectGutter}
                          showAddRow={mode === "edit" && !isSyncedDatabase}
                          showMenu={mode === "edit"}
                          top={virtualRow.start}
                        />
                      );
                    }
                    const row = item.row;
                    return (
                      <GridRow
                        columns={gridColumns}
                        databaseId={databaseId}
                        editingFieldId={
                          editing?.rowId === row.id ? editing.fieldId : null
                        }
                        hasAnyRowSelection={hasAnyRowSelection}
                        isSelected={selectedIdSet.has(row.id)}
                        key={row.id}
                        measureRow={virtualizer.measureElement}
                        mode={mode}
                        now={now}
                        onContextSelectRow={handleContextSelectRow}
                        onNavigate={handleNavigate}
                        onSelectionCleared={clearSelection}
                        onStartEdit={handleStartEdit}
                        onStopEdit={handleStopEdit}
                        onToggleSelected={handleToggleRowSelected}
                        primaryFieldId={primaryFieldId}
                        row={row}
                        rowIndex={virtualRow.index}
                        rowNumber={rowNumberById.get(row.id) ?? 0}
                        rowSelectDisplay={rowSelectDisplay}
                        rowSelectGutter={rowSelectGutter}
                        selectedRowIds={selectedRowIds}
                        showPageIcon={showPageIcon}
                        top={virtualRow.start}
                      />
                    );
                  })}
                </div>
              )}
              {hasCalculations ? (
                <DatabaseCalculateRow
                  calculations={calculations}
                  columns={gridColumns}
                  rowSelectGutter={rowSelectGutter}
                  rowSelectLeadingWidth={rowSelectLeadingWidth}
                  rows={rows}
                  totalWidth={totalWidth}
                />
              ) : null}
              {mode === "edit" ? (
                <DatabaseColumnDropIndicator gridRef={gridRef} />
              ) : null}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          {pinnedEdgeLeft === null ? null : (
            <div
              aria-hidden
              className="database-grid-pinned-shadow pointer-events-none absolute inset-y-0 z-30"
              ref={pinnedShadowRef}
              style={{ left: pinnedEdgeLeft }}
            />
          )}
        </div>
        {mode === "edit" && !isSyncedDatabase ? (
          <DatabaseAddRow
            databaseId={databaseId}
            onRowInserted={handleRowInserted}
          />
        ) : null}
        {mode === "edit" ? (
          <DatabaseColumnDragAutoScroll scrollRef={scrollRef} />
        ) : null}
      </DatabaseColumnDropZone>
    </DatabaseColumnDnd>
  );
}

/**
 * Gutter select-lane cells are transparent overlays: horizontally scrolled
 * content stays visible to the page's left boundary, and while scrolled the
 * lane's controls hide until the boundary strip is hovered (the scrollport
 * carries `data-hscrolled`). Non-gutter mode keeps the opaque in-table lane.
 */
const GUTTER_LANE_SCROLL_CLASS =
  "transition-opacity in-data-[hscrolled]:opacity-0 in-data-[hscrolled]:hover:opacity-100";

function GridSelectionHeaderCell({
  allSelected,
  onCheckedChange,
  rowSelectDisplay,
  showControl,
  someSelected,
}: {
  allSelected: boolean;
  onCheckedChange: (checked: boolean) => void;
  rowSelectDisplay: RowSelectDisplay;
  /** Keep the control visible while a range is selected (gutter hover modes). */
  showControl: boolean;
  someSelected: boolean;
}): ReactNode {
  const gutter = usesRowSelectGutter(rowSelectDisplay);
  return (
    // biome-ignore lint/a11y/useSemanticElements: div grid — see the grid container note.
    // biome-ignore lint/a11y/useFocusableInteractive: the checkbox inside is the focusable element.
    <div
      aria-colindex={1}
      className={cn(
        "sticky left-0 z-10 flex h-9 shrink-0 items-center justify-center",
        gutter ? GUTTER_LANE_SCROLL_CLASS : "bg-background",
        gutter && showControl && "in-data-[hscrolled]:opacity-100"
      )}
      // Own reveal group — do not put one on the grid root or every column
      // resize divider would light up on any table hover.
      data-reveal-group=""
      role="columnheader"
      style={{ width: SELECTION_COLUMN_WIDTH_PX }}
    >
      <Checkbox
        aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
        checked={allSelected}
        className={cn(
          rowSelectDisplay !== "always" && !showControl && "hover-reveal",
          showControl && rowSelectDisplay !== "always" && "opacity-100"
        )}
        indeterminate={someSelected}
        onCheckedChange={(checked) => {
          onCheckedChange(checked === true);
        }}
      />
    </div>
  );
}

interface GridHeaderCellProps {
  ariaColIndex: number;
  column: GridColumn;
  databaseId: string;
  displayFieldIds: readonly string[];
  mode: "view" | "edit";
  onResizeStart: (
    fieldId: string,
    minWidth: number,
    defaultWidth: number,
    event: React.PointerEvent<HTMLElement>
  ) => void;
  primaryFieldId: string;
  /** When true, draw the header rule on this cell (not under the select lane). */
  rowSelectGutter: boolean;
  sortDirection: "asc" | "desc" | undefined;
  view: DatabaseView;
  /** TanStack's `header.getSize()` — the table stays the size source at render. */
  width: number;
}

/**
 * One header cell: the column menu trigger wrapped in the press-threshold
 * drag source (click still opens the menu; press-and-move / long-press lifts
 * the header into a reorder drag — see `useDatabaseColumnHeaderDrag`), plus
 * the between-column resize zone on the cell's right edge. The source cell
 * dims to 50% while it is being dragged. Right-click opens the same column
 * menu via an imperative handle (no second menu surface).
 */
function GridHeaderCell({
  ariaColIndex,
  column,
  databaseId,
  displayFieldIds,
  mode,
  onResizeStart,
  primaryFieldId,
  rowSelectGutter,
  sortDirection,
  view,
  width,
}: GridHeaderCellProps) {
  const { field } = column;
  const openMenuRef = useRef<(() => void) | null>(null);
  const { headerProps, isDragging, showGrabbing } = useDatabaseColumnHeaderDrag(
    field.id
  );
  const Icon = resolveFieldIcon(field);
  // Checkbox columns are only as wide as the checkbox, so their header shows
  // just the field icon (centered over the checkbox); the name stays reachable
  // through the column menu.
  const isCheckbox = field.type === "checkbox";
  const headerContent = (
    <>
      <Icon className="size-4 shrink-0 stroke-[1.5px]" />
      {isCheckbox ? null : (
        <span className="truncate text-sm">{field.name}</span>
      )}
    </>
  );

  const handleHeaderContextMenu = (
    event: React.MouseEvent<HTMLElement>
  ): void => {
    if (mode !== "edit" || isDragging) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openMenuRef.current?.();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: div grid — see the grid container note.
    // biome-ignore lint/a11y/useFocusableInteractive: the menu trigger button inside is the focusable element.
    <div
      aria-colindex={ariaColIndex}
      aria-sort={
        sortDirection && (sortDirection === "asc" ? "ascending" : "descending")
      }
      className={cn(
        // `isolate`: the cell's internal z-20 resize zone must not escape into
        // the header row's stacking context, where it would paint above the
        // sticky pinned header (z-10) while scrolling underneath it.
        // Header cells carry no inter-column separators (only body cells do);
        // the freeze-boundary border on the last pinned column still applies.
        "relative isolate flex h-9 shrink-0 items-stretch overflow-visible bg-background text-muted-foreground",
        rowSelectGutter && "border-border border-b-[0.5px]",
        column.pinned && "sticky z-10",
        column.isLastPinned && "border-r border-r-border",
        isDragging && "opacity-50"
      )}
      onContextMenu={handleHeaderContextMenu}
      role="columnheader"
      style={{ width, left: column.left ?? undefined }}
      {...{
        [DATABASE_COLUMN_DRAG_ATTRIBUTE]:
          mode === "edit" ? field.id : undefined,
      }}
    >
      {mode === "edit" ? (
        <div
          {...headerProps}
          className={cn(
            "flex w-full min-w-0 select-none",
            showGrabbing && "cursor-grabbing [&_button]:cursor-grabbing"
          )}
        >
          <DatabaseColumnMenu
            databaseId={databaseId}
            displayFieldIds={displayFieldIds}
            field={field}
            isPrimary={field.id === primaryFieldId}
            openMenuRef={openMenuRef}
            triggerClassName={cn(
              "flex w-full min-w-0 items-center gap-1.5 overflow-hidden px-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 data-popup-open:bg-muted/50",
              isCheckbox && "justify-center"
            )}
            view={view}
          >
            {headerContent}
          </DatabaseColumnMenu>
        </div>
      ) : (
        <div
          className={cn(
            "flex w-full min-w-0 items-center gap-1.5 overflow-hidden px-2",
            isCheckbox && "justify-center"
          )}
        >
          {headerContent}
        </div>
      )}
      {mode === "edit" ? (
        <DatabaseColumnResizeZone
          defaultWidth={defaultColumnWidthPx(field)}
          fieldId={field.id}
          minWidth={minColumnWidthPx(field)}
          onResizeStart={onResizeStart}
        />
      ) : null}
    </div>
  );
}

interface GridGroupHeaderRowProps {
  collapsed: boolean;
  group: DatabaseRowGroup;
  /** Buckets hidden via `hiddenGroupKeys` — threaded to the context menu. */
  hiddenGroupCount: number;
  /** `virtualizer.measureElement` — headers report their fixed 36px height. */
  measureRow: (node: HTMLDivElement | null) => void;
  onAddRow: (group: DatabaseRowGroup) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onHideGroup: (groupKey: string) => void;
  onShowHiddenGroups: () => void;
  onToggle: (groupKey: string) => void;
  /** Zero-based flattened item index (drives measurement + ARIA row index). */
  rowIndex: number;
  /** Skip the rule under the select lane in gutter modes. */
  rowSelectGutter: boolean;
  /** Edit mode on a non-synced database — synced rows come from the source. */
  showAddRow: boolean;
  /** Edit mode — the right-click display menu writes view config. */
  showMenu: boolean;
  top: number;
}

/**
 * One group header row (Linear-style): full-width, spanning every column,
 * with the content stuck to the left edge like the "No rows" strip. The
 * whole row toggles collapse via an invisible full-row button (the chevron
 * rotates when expanded); a colored select option adds a status dot before
 * the label; the muted count and the hover-revealed per-group "+" (adds a
 * row pre-seeded with the group's value) trail it. In gutter row-select
 * modes the band's background starts at the data columns (the select lane
 * bleeds into the canvas gutter and must stay unpainted). Edit mode wraps
 * the row in the group display context menu. Memoized separately from
 * `GridRow` so scrolling stays cheap.
 */
const GridGroupHeaderRow = memo(function GridGroupHeaderRowInner({
  collapsed,
  group,
  hiddenGroupCount,
  measureRow,
  onAddRow,
  onCollapseAll,
  onExpandAll,
  onHideGroup,
  onShowHiddenGroups,
  onToggle,
  rowIndex,
  rowSelectGutter,
  showAddRow,
  showMenu,
  top,
}: GridGroupHeaderRowProps) {
  const colorDef = group.color ? BLOCK_COLOR_DEFS[group.color] : undefined;
  const row = (
    // biome-ignore lint/a11y/useSemanticElements: virtualized div grid — see the grid container note.
    // biome-ignore lint/a11y/useFocusableInteractive: the full-row toggle button inside is the focusable element.
    <div
      aria-rowindex={rowIndex + 2}
      className={cn(
        "absolute top-0 left-0 flex w-full",
        // Gutter modes: background and rule live on the data-cell area so
        // the select lane stays unpainted (canvas-gutter look) and the band
        // lines up with the table's left edge.
        !rowSelectGutter && "border-border border-b-[0.5px] bg-muted/30"
      )}
      data-index={rowIndex}
      data-reveal-group=""
      ref={measureRow}
      role="row"
      style={{
        height: GRID_ROW_HEIGHT_PX,
        transform: `translateY(${top}px)`,
      }}
    >
      {rowSelectGutter ? (
        <div
          aria-hidden
          className="shrink-0"
          style={{ width: SELECTION_COLUMN_WIDTH_PX }}
        />
      ) : null}
      {/* biome-ignore lint/a11y/useSemanticElements: div grid — see the grid container note. */}
      {/* biome-ignore lint/a11y/useFocusableInteractive: the toggle button inside is the focusable element. */}
      <div
        aria-colindex={1}
        className={cn(
          "relative flex min-w-0 flex-1",
          rowSelectGutter && "border-border border-b-[0.5px] bg-muted/30"
        )}
        role="gridcell"
      >
        <button
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} group ${group.label}`}
          className="absolute inset-0 cursor-pointer outline-none focus-visible:bg-muted/50"
          onClick={() => {
            onToggle(group.key);
          }}
          type="button"
        />
        {/* Visible content: sticky against horizontal scroll, click-through
            to the full-row toggle underneath (the "+" opts back in). */}
        <div className="pointer-events-none sticky left-0 z-10 flex max-w-full items-center gap-1.5 px-2">
          <IconChevronRight
            className={cn(
              "size-4 shrink-0 stroke-[1.5px] text-muted-foreground transition-transform",
              !collapsed && "rotate-90"
            )}
          />
          {colorDef ? (
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full bg-current",
                colorDef.textClass
              )}
            />
          ) : null}
          <span className="truncate font-medium text-sm">{group.label}</span>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {group.rows.length}
          </span>
          {showAddRow ? (
            <Button
              aria-label={`Add row to group ${group.label}`}
              className="hover-reveal pointer-events-auto shrink-0 text-muted-foreground"
              onClick={() => {
                onAddRow(group);
              }}
              size="icon-xs"
              variant="ghost"
            >
              <IconPlus />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (!showMenu) {
    return row;
  }
  return (
    <DatabaseGroupMenu
      collapsed={collapsed}
      group={group}
      hiddenGroupCount={hiddenGroupCount}
      onCollapseAll={onCollapseAll}
      onExpandAll={onExpandAll}
      onHideGroup={onHideGroup}
      onShowHiddenGroups={onShowHiddenGroups}
      onToggle={onToggle}
    >
      {row}
    </DatabaseGroupMenu>
  );
});

interface GridRowProps {
  columns: readonly GridColumn[];
  /** Addressed by the primary cell's "Open" pill (`/db/{databaseId}/{rowId}`). */
  databaseId: string;
  /** The field currently editing in this row, `null` otherwise. */
  editingFieldId: string | null;
  hasAnyRowSelection: boolean;
  isSelected: boolean;
  /** `virtualizer.measureElement` — rows auto-size when content wraps. */
  measureRow: (node: HTMLDivElement | null) => void;
  mode: "view" | "edit";
  /** Display clock instant — a tick re-renders the row (relative dates). */
  now: Date;
  onContextSelectRow: (rowId: string) => void;
  onNavigate: (move: CellEditMove, from: CellEditTarget) => void;
  onSelectionCleared: () => void;
  onStartEdit: (target: CellEditTarget) => void;
  onStopEdit: () => void;
  onToggleSelected: (
    rowId: string,
    checked: boolean,
    shiftKey: boolean
  ) => void;
  /** Primary-field cells carry the hover-revealed row-page "Open" pill. */
  primaryFieldId: string;
  row: LocalDatabaseRow;
  /** Zero-based data row index (drives measurement + ARIA row index). */
  rowIndex: number;
  /** One-based visible row number (flat data rows only, for number gutter mode). */
  rowNumber: number;
  rowSelectDisplay: RowSelectDisplay;
  /** Skip the rule under the select lane in gutter modes. */
  rowSelectGutter: boolean;
  selectedRowIds: readonly string[];
  /** Render a page icon in the primary (title) cell (per-view toggle). */
  showPageIcon: boolean;
  top: number;
}

/**
 * One virtualized grid row. Memoized so scrolling and unrelated cell edits
 * never re-render it — the collection layer's structural sharing keeps `row`
 * identity stable, callbacks are stable, and `editingFieldId` only changes
 * for the affected row. `now` only changes identity on the display-clock
 * tick (gated on volatile formulas / relative date columns), so the memo
 * holds for clock-free schemas. Height is `min-h` rather than fixed so
 * wrapped cells can grow the row; the virtualizer measures the real height
 * per row.
 */
const GridRow = memo(function GridRowInner({
  columns,
  databaseId,
  editingFieldId,
  hasAnyRowSelection,
  isSelected,
  measureRow,
  mode,
  now,
  onContextSelectRow,
  onNavigate,
  onSelectionCleared,
  onStartEdit,
  onStopEdit,
  onToggleSelected,
  primaryFieldId,
  row,
  rowIndex,
  rowNumber,
  rowSelectDisplay,
  rowSelectGutter,
  selectedRowIds,
  showPageIcon,
  top,
}: GridRowProps) {
  const rowAnchorRef = useRef<HTMLDivElement | null>(null);
  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowAnchorRef.current = node;
      measureRow(node);
    },
    [measureRow]
  );

  const showSelectControl = isSelected || hasAnyRowSelection;
  const rowCheckbox = (
    <Checkbox
      aria-label="Select row"
      checked={isSelected}
      className={cn(
        rowSelectDisplay === "number" && "swap-reveal absolute inset-0 m-auto",
        rowSelectDisplay === "hover" && !showSelectControl && "hover-reveal",
        showSelectControl && rowSelectDisplay !== "always" && "opacity-100",
        rowSelectDisplay === "number" &&
          showSelectControl &&
          "swap-reveal opacity-100"
      )}
      onCheckedChange={(checked, eventDetails) => {
        const shiftKey =
          "shiftKey" in eventDetails.event &&
          Boolean((eventDetails.event as { shiftKey?: boolean }).shiftKey);
        onToggleSelected(row.id, checked === true, shiftKey);
      }}
    />
  );

  // Leading select lane — in-flow so data columns never sit under the
  // checkbox. Gutter modes (`hover` / `number`) hide the control until
  // row hover (or while any row is selected); the grid itself bleeds
  // left by this lane's width so the first field stays filter-aligned.
  const rowSelectCell = (
    // biome-ignore lint/a11y/useSemanticElements: div grid — see the grid container note.
    // biome-ignore lint/a11y/useFocusableInteractive: the checkbox inside is the focusable element.
    <div
      aria-colindex={1}
      className={cn(
        "sticky left-0 z-10 flex shrink-0 items-center justify-center",
        isSelected && "bg-muted/40",
        rowSelectGutter
          ? GUTTER_LANE_SCROLL_CLASS
          : !isSelected && "bg-background",
        rowSelectGutter &&
          showSelectControl &&
          "in-data-[hscrolled]:opacity-100"
      )}
      role="gridcell"
      style={{ width: SELECTION_COLUMN_WIDTH_PX }}
    >
      {rowSelectDisplay === "number" ? (
        <div className="relative flex size-full items-center justify-center">
          <span
            aria-hidden={showSelectControl}
            className={cn(
              "swap-conceal text-muted-foreground text-xs tabular-nums",
              showSelectControl && "opacity-0"
            )}
          >
            {rowNumber}
          </span>
          {rowCheckbox}
        </div>
      ) : (
        rowCheckbox
      )}
    </div>
  );

  return (
    <DatabaseRowMenu
      contextRow={row}
      databaseId={databaseId}
      mode={mode}
      onBeforeOpen={onContextSelectRow}
      onSelectionCleared={onSelectionCleared}
      rowAnchorRef={rowAnchorRef}
      selectedRowIds={selectedRowIds}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: virtualized div grid — native table rows can't be absolutely positioned. */}
      {/* biome-ignore lint/a11y/useFocusableInteractive: focus lives on the cell editors, not the row. */}
      <div
        aria-rowindex={rowIndex + 2}
        aria-selected={isSelected}
        className={cn(
          "absolute top-0 left-0 flex w-full",
          // Gutter modes: border lives on data cells so the select lane
          // stays borderless (canvas-gutter look).
          !rowSelectGutter && "border-border border-b-[0.5px]",
          isSelected && "bg-muted/40"
        )}
        data-index={rowIndex}
        data-reveal-group=""
        ref={setRowRef}
        role="row"
        style={{
          minHeight: GRID_ROW_HEIGHT_PX,
          transform: `translateY(${top}px)`,
        }}
      >
        {rowSelectCell}
        {columns.map((column, columnIndex) => (
          <GridCell
            ariaColIndex={columnIndex + 2}
            column={column}
            databaseId={databaseId}
            isEditing={editingFieldId === column.field.id}
            isPrimary={column.field.id === primaryFieldId}
            isSelected={isSelected}
            key={column.field.id}
            mode={mode}
            now={now}
            onNavigate={onNavigate}
            onStartEdit={onStartEdit}
            onStopEdit={onStopEdit}
            row={row}
            rowSelectGutter={rowSelectGutter}
            showPageIcon={showPageIcon}
          />
        ))}
      </div>
    </DatabaseRowMenu>
  );
});

interface GridCellProps {
  ariaColIndex: number;
  column: GridColumn;
  databaseId: string;
  isEditing: boolean;
  /** Primary-field cell — renders the row-page "Open" pill. */
  isPrimary: boolean;
  isSelected: boolean;
  mode: "view" | "edit";
  /** Display clock instant for relative date rendering. */
  now: Date;
  onNavigate: (move: CellEditMove, from: CellEditTarget) => void;
  onStartEdit: (target: CellEditTarget) => void;
  onStopEdit: () => void;
  row: LocalDatabaseRow;
  /** Draw the row rule on data cells (not under the select lane). */
  rowSelectGutter: boolean;
  /** Prepend a page icon to the primary (title) cell (per-view toggle). */
  showPageIcon: boolean;
}

/**
 * Hover-revealed "Open" pill at the primary cell's right edge, navigating to
 * the row's (virtual or materialized) page at `/db/{databaseId}/{rowId}`.
 * Present in BOTH modes — published (view-mode) pages must still open row
 * pages. Reveals on row hover/focus on fine pointers and stays visible on
 * coarse pointers (`.hover-reveal` under the row's `data-reveal-group`);
 * click stops propagation so it never starts a cell edit.
 */
function GridCellOpenPill({
  databaseId,
  rowId,
}: {
  databaseId: string;
  rowId: string;
}) {
  return (
    <Button
      className="hover-reveal absolute inset-y-0 right-1 z-10 my-auto h-6 border border-border bg-background text-muted-foreground shadow-xs"
      nativeButton={false}
      onClick={(event) => {
        event.stopPropagation();
      }}
      render={
        <Link params={{ databaseId, rowId }} to="/db/$databaseId/$rowId" />
      }
      size="xs"
      variant="ghost"
    >
      <IconArrowsDiagonal />
      Open
    </Button>
  );
}

/**
 * Builds a grid cell's inner content: the checkbox editor (edit mode), the
 * inline-edit trigger button, or the plain value view. Primary (title) cells
 * prepend a Notion-style page icon when `showPageIcon` is set. Extracted from
 * `GridCell` to keep that component's branching under the complexity budget.
 */
function renderGridCellContent({
  field,
  inlineEditable,
  isCheckbox,
  mode,
  onStartEdit,
  row,
  showPageIcon,
  value,
  valueView,
}: {
  field: DatabaseField;
  inlineEditable: boolean;
  isCheckbox: boolean;
  mode: "view" | "edit";
  onStartEdit: (target: CellEditTarget) => void;
  row: LocalDatabaseRow;
  showPageIcon: boolean;
  value: LocalDatabaseRow["values"][string];
  valueView: ReactNode;
}): ReactNode {
  if (mode === "edit" && isCheckbox) {
    return (
      <DatabaseCheckboxCellEditor
        // Synced checkbox columns render the checkbox but never write — the
        // sync engine owns their values.
        disabled={isSyncedField(field)}
        field={field}
        rowId={row.id}
        value={value}
      />
    );
  }

  // The default document glyph — rows carry no per-row icon; the whole cell
  // still opens the row page via the hover "Open" pill.
  const label = showPageIcon ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <IconFileText
        aria-hidden
        className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground/70"
      />
      {valueView}
    </span>
  ) : (
    valueView
  );

  if (inlineEditable) {
    return (
      <button
        className={cn(
          "flex size-full min-w-0 cursor-default items-center overflow-hidden text-left outline-none",
          field.type === "number" && "justify-end"
        )}
        onClick={() => {
          onStartEdit({ rowId: row.id, fieldId: field.id });
        }}
        tabIndex={-1}
        type="button"
      >
        {label}
      </button>
    );
  }

  return label;
}

function GridCell({
  ariaColIndex,
  column,
  databaseId,
  isEditing,
  isPrimary,
  isSelected,
  mode,
  now,
  onNavigate,
  onStartEdit,
  onStopEdit,
  row,
  rowSelectGutter,
  showPageIcon,
}: GridCellProps) {
  const { field } = column;
  const value = row.values[field.id];
  const inlineEditable = mode === "edit" && isInlineEditableField(field);
  const isCheckbox = field.type === "checkbox";
  const wrapsContent = column.wrap && !isCheckbox;

  const valueView = wrapsContent ? (
    <span className={WRAPPED_CELL_CONTENT_CLASS}>
      <DatabaseCellValueView
        field={field}
        mode={mode}
        now={now}
        value={value}
      />
    </span>
  ) : (
    <DatabaseCellValueView field={field} mode={mode} now={now} value={value} />
  );

  const content = renderGridCellContent({
    field,
    inlineEditable,
    isCheckbox,
    mode,
    onStartEdit,
    row,
    // Notion-style page icon at the head of the title cell — every row "is" a
    // page, so the primary cell reads as a page link (a per-view toggle).
    showPageIcon: isPrimary && showPageIcon,
    value,
    valueView,
  });

  return (
    // biome-ignore lint/a11y/useSemanticElements: virtualized div grid — see the grid container note.
    // biome-ignore lint/a11y/useFocusableInteractive: the inline editor / cell button inside is the focusable element.
    <div
      aria-colindex={ariaColIndex}
      className={cn(
        // No fixed height: cells stretch with the row so wrapped content can
        // grow it past GRID_ROW_HEIGHT_PX.
        // `isolate` mirrors the header cell: positioned children keep their
        // z-index inside the cell instead of leaking above pinned siblings.
        "relative isolate flex shrink-0 items-center overflow-hidden text-foreground text-sm",
        rowSelectGutter && "border-border border-b-[0.5px]",
        column.showVerticalLine && "border-border/60 border-r-[0.5px]",
        inlineEditable ? "p-0" : "px-2",
        field.type === "number" && "justify-end",
        isCheckbox && "justify-center",
        column.pinned && "sticky z-10",
        column.pinned && (isSelected ? "bg-muted/40" : "bg-background"),
        column.isLastPinned && "border-r border-r-border"
      )}
      role="gridcell"
      style={{ width: column.width, left: column.left ?? undefined }}
    >
      {inlineEditable ? (
        <div className="size-full px-2">{content}</div>
      ) : (
        content
      )}
      {isPrimary ? (
        <GridCellOpenPill databaseId={databaseId} rowId={row.id} />
      ) : null}
      {isEditing && inlineEditable ? (
        <DatabaseCellInlineEditor
          field={field}
          onNavigate={onNavigate}
          onStopEdit={onStopEdit}
          rowId={row.id}
          value={value}
          width={column.width}
        />
      ) : null}
    </div>
  );
}
