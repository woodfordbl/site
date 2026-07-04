import { IconPlus } from "@tabler/icons-react";
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  GRID_ROW_HEIGHT_PX,
  type GridColumn,
  isInlineEditableField,
  MIN_COLUMN_WIDTH_PX,
  nextEditTarget,
  resolveColumnWidthPx,
} from "@/components/database/database-grid-helpers.ts";
import { useDatabaseColumnHeaderDrag } from "@/components/database/use-database-column-drag.ts";
import { useDatabaseColumnResize } from "@/components/database/use-database-column-resize.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  addDatabaseField,
  updateDatabaseView,
} from "@/db/queries/database-collection-ops.ts";
import { createDatabaseField } from "@/lib/databases/field-defs.ts";
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
 */

/** Extra virtual rows above/below the viewport. */
const ROW_OVERSCAN = 12;

/** Vertical cap so row virtualization has a bounded scrollport. */
const GRID_MAX_HEIGHT_CLASS = "max-h-[600px]";

/** Width of the trailing edit-mode "+" add-field header cell. */
const ADD_FIELD_CELL_WIDTH_PX = 36;

/** Scroll distance over which the pinned-edge fade ramps from 0 to 1. */
const PINNED_FADE_RAMP_PX = 24;

/**
 * Wrapped cells clamp to two lines inside the auto-height row (the
 * virtualizer measures real row heights via `measureElement`); unclamped
 * full wrapping is deferred until row heights get proper UX treatment.
 */
const WRAPPED_CELL_CONTENT_CLASS =
  "line-clamp-2 min-w-0 whitespace-normal break-words py-1.5 [&_span]:whitespace-normal";

interface DatabaseTableGridProps {
  /** Visible fields in display order (`resolveColumnOrder`). */
  columns: readonly DatabaseField[];
  databaseId: string;
  mode: "view" | "edit";
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
  mode,
  pinnedFields,
  primaryFieldId,
  rows,
  view,
}: DatabaseTableGridProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState<CellEditTarget | null>(null);

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

  const pinnedTotalWidth = useMemo(
    () =>
      pinnedFields.reduce(
        (total, field) => total + resolveColumnWidthPx(view.config, field.id),
        0
      ),
    [pinnedFields, view.config]
  );
  // Keep at least one minimum-width column of scrollable room; SSR/first
  // paint (width unknown) keeps the configured pinning for desktop parity.
  const pinningDisabled =
    scrollportWidth !== null &&
    pinnedTotalWidth > scrollportWidth - MIN_COLUMN_WIDTH_PX;
  const effectivePinnedFields = pinningDisabled ? [] : pinnedFields;

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
    let offset = 0;
    return ordered.map((field, index) => {
      const width =
        liveWidths?.[field.id] ?? resolveColumnWidthPx(view.config, field.id);
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
  }, [columns, effectivePinnedFields, liveWidths, view.config]);

  const displayFieldIds = useMemo(
    () => gridColumns.map((column) => column.field.id),
    [gridColumns]
  );

  const columnDefs = useMemo<ColumnDef<LocalDatabaseRow>[]>(
    () =>
      gridColumns.map((column) => ({
        id: column.field.id,
        size: column.width,
        minSize: MIN_COLUMN_WIDTH_PX,
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
  const totalWidth = table.getTotalSize();
  const gridWidth =
    mode === "edit" ? totalWidth + ADD_FIELD_CELL_WIDTH_PX : totalWidth;
  const hasPinnedColumns = effectivePinnedFields.length > 0;

  // Pinned-edge fade: a rAF-throttled scroll listener writes the fade
  // opacity (0 at scrollLeft 0, ramping over PINNED_FADE_RAMP_PX, and only
  // while real horizontal overflow exists) into a CSS custom property; the
  // `.database-grid-pinned-edge` rule in styles.css does the rest — the
  // horizontal analogue of `.scroll-fade-y`/`--scroll-area-overflow-*`.
  useEffect(() => {
    const element = scrollRef.current;
    if (!(element && hasPinnedColumns)) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const overflowing = gridWidth > element.clientWidth;
      const fade = overflowing
        ? Math.min(element.scrollLeft / PINNED_FADE_RAMP_PX, 1)
        : 0;
      element.style.setProperty("--database-grid-pinned-fade", String(fade));
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
      element.style.removeProperty("--database-grid-pinned-fade");
    };
  }, [gridWidth, hasPinnedColumns]);

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

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GRID_ROW_HEIGHT_PX,
    overscan: ROW_OVERSCAN,
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
      rowIds: rows.map((row) => row.id),
    };
  }, [editableFieldIds, rows]);

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

  const handleRowInserted = useCallback(
    (row: LocalDatabaseRow) => {
      // Focus the new row's primary cell when it takes the inline editor.
      if (editStateRef.current.editableFieldIds.includes(primaryFieldId)) {
        setEditing({ rowId: row.id, fieldId: primaryFieldId });
      }
    },
    [primaryFieldId]
  );

  // Keep the editing row mounted: keyboard navigation and freshly inserted
  // rows may land outside the virtual window.
  useEffect(() => {
    if (!editing) {
      return;
    }
    const index = rows.findIndex((row) => row.id === editing.rowId);
    if (index >= 0) {
      virtualizer.scrollToIndex(index);
    }
  }, [editing, rows, virtualizer]);

  const calculations = view.config.calculations;
  const hasCalculations =
    calculations !== undefined && Object.keys(calculations).length > 0;

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
      <DatabaseColumnDropZone className="w-full min-w-0 overflow-hidden rounded-lg border border-border">
        <div
          className={cn("relative overflow-auto", GRID_MAX_HEIGHT_CLASS)}
          ref={scrollRef}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: virtualized sticky/pinned layout — a native <table> cannot express it. */}
          <div
            aria-colcount={gridColumns.length}
            aria-rowcount={rows.length + 1}
            className="relative"
            ref={gridRef}
            role="grid"
            style={{ width: gridWidth, minWidth: "100%" }}
          >
            {/* biome-ignore lint/a11y/useSemanticElements: div grid — see role="grid" note above. */}
            {/* biome-ignore lint/a11y/useFocusableInteractive: focus lives on the header menu triggers, not the row. */}
            <div
              aria-rowindex={1}
              className="sticky top-0 z-20 flex border-border border-b bg-background"
              role="row"
            >
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
                      ariaColIndex={headerIndex + 1}
                      column={column}
                      databaseId={databaseId}
                      displayFieldIds={displayFieldIds}
                      key={header.id}
                      mode={mode}
                      onResizeStart={startResize}
                      primaryFieldId={primaryFieldId}
                      sortDirection={sort?.direction}
                      view={view}
                      width={header.getSize()}
                    />
                  );
                })
              )}
              {mode === "edit" ? (
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                  <Button
                    aria-label="Add property"
                    // Hit area covers the whole 36px header cell (anchored to
                    // the relative wrapper) — the visual 24px button alone is
                    // too small a touch target.
                    className="static after:absolute after:inset-0"
                    onClick={handleAddField}
                    size="icon-xs"
                    variant="ghost"
                  >
                    <IconPlus />
                  </Button>
                </div>
              ) : null}
            </div>
            {rows.length === 0 ? (
              <div className="flex h-9 items-center px-2 text-muted-foreground text-sm">
                <span className="sticky left-2">No rows</span>
              </div>
            ) : (
              // biome-ignore lint/a11y/useSemanticElements: div grid — see role="grid" note above.
              <div
                className="relative"
                role="rowgroup"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <GridRow
                      columns={gridColumns}
                      editingFieldId={
                        editing?.rowId === row.id ? editing.fieldId : null
                      }
                      key={row.id}
                      measureRow={virtualizer.measureElement}
                      mode={mode}
                      onNavigate={handleNavigate}
                      onStartEdit={handleStartEdit}
                      onStopEdit={handleStopEdit}
                      row={row}
                      rowIndex={virtualRow.index}
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
                rows={rows}
                totalWidth={totalWidth}
              />
            ) : null}
            {mode === "edit" ? (
              <DatabaseColumnDropIndicator gridRef={gridRef} />
            ) : null}
          </div>
        </div>
        {mode === "edit" ? (
          <div className="border-border border-t">
            <DatabaseAddRow
              databaseId={databaseId}
              onRowInserted={handleRowInserted}
            />
          </div>
        ) : null}
        {mode === "edit" ? (
          <DatabaseColumnDragAutoScroll scrollRef={scrollRef} />
        ) : null}
      </DatabaseColumnDropZone>
    </DatabaseColumnDnd>
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
    event: React.PointerEvent<HTMLElement>
  ) => void;
  primaryFieldId: string;
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
 * dims to 50% while it is being dragged.
 */
function GridHeaderCell({
  ariaColIndex,
  column,
  databaseId,
  displayFieldIds,
  mode,
  onResizeStart,
  primaryFieldId,
  sortDirection,
  view,
  width,
}: GridHeaderCellProps) {
  const { field } = column;
  const { headerProps, isDragging, showGrabbing } = useDatabaseColumnHeaderDrag(
    field.id
  );
  const Icon = resolveFieldIcon(field);
  const headerContent = (
    <>
      <Icon className="size-4 shrink-0 stroke-[1.5px]" />
      <span className="truncate text-sm">{field.name}</span>
    </>
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: div grid — see the grid container note.
    // biome-ignore lint/a11y/useFocusableInteractive: the menu trigger button inside is the focusable element.
    <div
      aria-colindex={ariaColIndex}
      aria-sort={
        sortDirection && (sortDirection === "asc" ? "ascending" : "descending")
      }
      className={cn(
        "relative flex h-9 shrink-0 items-stretch overflow-hidden bg-background text-muted-foreground",
        column.showVerticalLine && "border-border/60 border-r",
        column.pinned && "sticky z-10",
        column.isLastPinned &&
          "database-grid-pinned-edge border-r border-r-border",
        isDragging && "opacity-50"
      )}
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
            triggerClassName="flex w-full min-w-0 items-center gap-1.5 overflow-hidden px-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 data-popup-open:bg-muted/50"
            view={view}
          >
            {headerContent}
          </DatabaseColumnMenu>
        </div>
      ) : (
        <div className="flex w-full min-w-0 items-center gap-1.5 overflow-hidden px-2">
          {headerContent}
        </div>
      )}
      {mode === "edit" ? (
        <DatabaseColumnResizeZone
          fieldId={field.id}
          onResizeStart={onResizeStart}
        />
      ) : null}
    </div>
  );
}

interface GridRowProps {
  columns: readonly GridColumn[];
  /** The field currently editing in this row, `null` otherwise. */
  editingFieldId: string | null;
  /** `virtualizer.measureElement` — rows auto-size when content wraps. */
  measureRow: (node: HTMLDivElement | null) => void;
  mode: "view" | "edit";
  onNavigate: (move: CellEditMove, from: CellEditTarget) => void;
  onStartEdit: (target: CellEditTarget) => void;
  onStopEdit: () => void;
  row: LocalDatabaseRow;
  /** Zero-based data row index (drives measurement + ARIA row index). */
  rowIndex: number;
  top: number;
}

/**
 * One virtualized grid row. Memoized so scrolling and unrelated cell edits
 * never re-render it — the collection layer's structural sharing keeps `row`
 * identity stable, callbacks are stable, and `editingFieldId` only changes
 * for the affected row. Height is `min-h` rather than fixed so wrapped cells
 * can grow the row; the virtualizer measures the real height per row.
 */
const GridRow = memo(function GridRowInner({
  columns,
  editingFieldId,
  measureRow,
  mode,
  onNavigate,
  onStartEdit,
  onStopEdit,
  row,
  rowIndex,
  top,
}: GridRowProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: virtualized div grid — native table rows can't be absolutely positioned.
    // biome-ignore lint/a11y/useFocusableInteractive: focus lives on the cell editors, not the row.
    <div
      aria-rowindex={rowIndex + 2}
      className="absolute top-0 left-0 flex w-full border-border border-b"
      data-index={rowIndex}
      ref={measureRow}
      role="row"
      style={{
        minHeight: GRID_ROW_HEIGHT_PX,
        transform: `translateY(${top}px)`,
      }}
    >
      {columns.map((column, columnIndex) => (
        <GridCell
          ariaColIndex={columnIndex + 1}
          column={column}
          isEditing={editingFieldId === column.field.id}
          key={column.field.id}
          mode={mode}
          onNavigate={onNavigate}
          onStartEdit={onStartEdit}
          onStopEdit={onStopEdit}
          row={row}
        />
      ))}
    </div>
  );
});

interface GridCellProps {
  ariaColIndex: number;
  column: GridColumn;
  isEditing: boolean;
  mode: "view" | "edit";
  onNavigate: (move: CellEditMove, from: CellEditTarget) => void;
  onStartEdit: (target: CellEditTarget) => void;
  onStopEdit: () => void;
  row: LocalDatabaseRow;
}

function GridCell({
  ariaColIndex,
  column,
  isEditing,
  mode,
  onNavigate,
  onStartEdit,
  onStopEdit,
  row,
}: GridCellProps) {
  const { field } = column;
  const value = row.values[field.id];
  const inlineEditable = mode === "edit" && isInlineEditableField(field);
  const isCheckbox = field.type === "checkbox";
  const wrapsContent = column.wrap && !isCheckbox;

  const valueView = wrapsContent ? (
    <span className={WRAPPED_CELL_CONTENT_CLASS}>
      <DatabaseCellValueView field={field} mode={mode} value={value} />
    </span>
  ) : (
    <DatabaseCellValueView field={field} mode={mode} value={value} />
  );

  let content: ReactNode;
  if (mode === "edit" && isCheckbox) {
    content = (
      <DatabaseCheckboxCellEditor field={field} rowId={row.id} value={value} />
    );
  } else if (inlineEditable) {
    content = (
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
        {valueView}
      </button>
    );
  } else {
    content = valueView;
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: virtualized div grid — see the grid container note.
    // biome-ignore lint/a11y/useFocusableInteractive: the inline editor / cell button inside is the focusable element.
    <div
      aria-colindex={ariaColIndex}
      className={cn(
        // No fixed height: cells stretch with the row so wrapped content can
        // grow it past GRID_ROW_HEIGHT_PX.
        "relative flex shrink-0 items-center overflow-hidden text-foreground text-sm",
        column.showVerticalLine && "border-border/60 border-r",
        inlineEditable ? "p-0" : "px-2",
        field.type === "number" && "justify-end",
        isCheckbox && "justify-center",
        column.pinned && "sticky z-10 bg-background",
        column.isLastPinned &&
          "database-grid-pinned-edge border-r border-r-border"
      )}
      role="gridcell"
      style={{ width: column.width, left: column.left ?? undefined }}
    >
      {inlineEditable ? (
        <div className="size-full px-2">{content}</div>
      ) : (
        content
      )}
      {isEditing && inlineEditable ? (
        <DatabaseCellInlineEditor
          field={field}
          onNavigate={onNavigate}
          onStopEdit={onStopEdit}
          rowId={row.id}
          value={value}
        />
      ) : null}
    </div>
  );
}
