import {
  IconAlignLeft,
  IconCalendar,
  IconCircleDot,
  IconHash,
  IconLink,
  IconList,
  IconSquareCheck,
} from "@tabler/icons-react";
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type ComponentType,
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
import type {
  DatabaseField,
  DatabaseFieldType,
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

const FIELD_TYPE_ICONS: Record<
  DatabaseFieldType,
  ComponentType<{ className?: string }>
> = {
  text: IconAlignLeft,
  number: IconHash,
  checkbox: IconSquareCheck,
  select: IconCircleDot,
  multiSelect: IconList,
  date: IconCalendar,
  url: IconLink,
};

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
  const [editing, setEditing] = useState<CellEditTarget | null>(null);

  // Column render metadata: width from the view config (clamped), pinned
  // columns first with cumulative sticky offsets — the same math TanStack's
  // `columnPinning` state machine applies, kept memoized on the raw view
  // inputs so memoized rows only re-render when the schema/config changes.
  const gridColumns = useMemo<GridColumn[]>(() => {
    const pinnedIds = new Set(pinnedFields.map((field) => field.id));
    const ordered = [
      ...pinnedFields,
      ...columns.filter((field) => !pinnedIds.has(field.id)),
    ];
    let offset = 0;
    return ordered.map((field, index) => {
      const width = resolveColumnWidthPx(view.config, field.id);
      const pinned = index < pinnedIds.size;
      const column: GridColumn = {
        field,
        width,
        pinned,
        left: pinned ? offset : null,
        isLastPinned: pinned && index === pinnedIds.size - 1,
      };
      if (pinned) {
        offset += width;
      }
      return column;
    });
  }, [columns, pinnedFields, view.config]);

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
    () => ({ left: pinnedFields.map((field) => field.id) }),
    [pinnedFields]
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
    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-border">
      <div
        className={cn("relative overflow-auto", GRID_MAX_HEIGHT_CLASS)}
        ref={scrollRef}
      >
        <div style={{ width: totalWidth, minWidth: "100%" }}>
          <div className="sticky top-0 z-20 flex border-border border-b bg-background">
            {table.getHeaderGroups().map((headerGroup) =>
              headerGroup.headers.map((header) => {
                const column = gridColumns.find(
                  (entry) => entry.field.id === header.column.id
                );
                if (!column) {
                  return null;
                }
                const Icon = FIELD_TYPE_ICONS[column.field.type];
                return (
                  <div
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-1.5 overflow-hidden border-border/60 border-r bg-background px-2 text-muted-foreground",
                      column.pinned && "sticky z-10",
                      column.isLastPinned && "border-r-border"
                    )}
                    key={header.id}
                    style={{
                      width: header.getSize(),
                      left: column.left ?? undefined,
                    }}
                  >
                    <Icon className="size-4 shrink-0 stroke-[1.5px]" />
                    <span className="truncate text-sm">
                      {column.field.name}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          {rows.length === 0 ? (
            <div className="flex h-9 items-center px-2 text-muted-foreground text-sm">
              <span className="sticky left-2">No rows</span>
            </div>
          ) : (
            <div
              className="relative"
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
                    mode={mode}
                    onNavigate={handleNavigate}
                    onStartEdit={handleStartEdit}
                    onStopEdit={handleStopEdit}
                    row={row}
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
    </div>
  );
}

interface GridRowProps {
  columns: readonly GridColumn[];
  /** The field currently editing in this row, `null` otherwise. */
  editingFieldId: string | null;
  mode: "view" | "edit";
  onNavigate: (move: CellEditMove, from: CellEditTarget) => void;
  onStartEdit: (target: CellEditTarget) => void;
  onStopEdit: () => void;
  row: LocalDatabaseRow;
  top: number;
}

/**
 * One virtualized grid row. Memoized so scrolling and unrelated cell edits
 * never re-render it — the collection layer's structural sharing keeps `row`
 * identity stable, callbacks are stable, and `editingFieldId` only changes
 * for the affected row.
 */
const GridRow = memo(function GridRowInner({
  columns,
  editingFieldId,
  mode,
  onNavigate,
  onStartEdit,
  onStopEdit,
  row,
  top,
}: GridRowProps) {
  return (
    <div
      className="absolute top-0 left-0 flex w-full border-border border-b"
      style={{
        height: GRID_ROW_HEIGHT_PX,
        transform: `translateY(${top}px)`,
      }}
    >
      {columns.map((column) => (
        <GridCell
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
  column: GridColumn;
  isEditing: boolean;
  mode: "view" | "edit";
  onNavigate: (move: CellEditMove, from: CellEditTarget) => void;
  onStartEdit: (target: CellEditTarget) => void;
  onStopEdit: () => void;
  row: LocalDatabaseRow;
}

function GridCell({
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
        <DatabaseCellValueView field={field} mode={mode} value={value} />
      </button>
    );
  } else {
    content = <DatabaseCellValueView field={field} mode={mode} value={value} />;
  }

  return (
    <div
      className={cn(
        "relative flex h-full shrink-0 items-center overflow-hidden border-border/60 border-r text-foreground text-sm",
        inlineEditable ? "p-0" : "px-2",
        field.type === "number" && "justify-end",
        isCheckbox && "justify-center",
        column.pinned && "sticky z-10 bg-background",
        column.isLastPinned && "border-r-border"
      )}
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
