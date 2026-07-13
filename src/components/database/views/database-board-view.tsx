import { IconDots, IconEyeOff, IconPlus } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";

import { DatabaseCellValueView } from "@/components/database/database-cell.tsx";
import { DatabaseColumnDragAutoScroll } from "@/components/database/database-column-dnd.tsx";
import { isSyncedField } from "@/components/database/database-grid-helpers.ts";
import { useDatabaseColumnHeaderDrag } from "@/components/database/use-database-column-drag.ts";
import {
  type BoardCardRect,
  type BoardColumn,
  type BoardColumnZone,
  type BoardDropTarget,
  type BoardGroupField,
  buildBoardColumns,
  resolveBoardCardFields,
  resolveBoardDropTarget,
  resolveBoardGroupField,
} from "@/components/database/views/board-helpers.ts";
import {
  DndSurface,
  type DndSurfaceConfig,
} from "@/components/dnd/dnd-surface.tsx";
import { DragOverlay } from "@/components/dnd/drag-overlay.tsx";
import { useDropTarget, useDropZone } from "@/components/dnd/use-dnd.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  addDatabaseField,
  insertDatabaseRow,
  reorderDatabaseRow,
  updateDatabaseCell,
  updateDatabaseView,
} from "@/db/queries/database-collection-ops.ts";
import { BLOCK_COLOR_DEFS } from "@/lib/blocks/block-colors.ts";
import {
  coerceCellValue,
  formatCellValue,
  isCellEmpty,
} from "@/lib/databases/cell-values.ts";
import { createDatabaseField } from "@/lib/databases/field-defs.ts";
import { groupKeyForRow } from "@/lib/databases/row-group.ts";
import { createDragChannel } from "@/lib/dnd/drag-channel.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Board (kanban) view: one column per option of the board group field
 * (`view.config.board.groupFieldId`, else the first select field) in option
 * order, a trailing "No <field>" column for empty values, cards rendered
 * with the shared cell renderers, and card click opening the row page.
 *
 * **Drag-drop** (edit mode only) rides the shared `lib/dnd` toolkit with the
 * repo's drag grammar (press-threshold lift on fine pointers, ~450ms
 * long-press on coarse — the same `useDatabaseColumnHeaderDrag` gesture the
 * grid's column headers use, bound to card row ids). A cross-column drop
 * writes the group field's option id via `updateDatabaseCell`; an
 * intra-column drop reorders via `reorderDatabaseRow` against the drop
 * neighbor.
 *
 * **Order semantics:** board order IS the table's manual order — both read
 * the same sparse `row.order` key (`compareManualOrder`). Reordering between
 * two cards of a column places the row between those rows globally, so the
 * board's intra-column order and the table's manual order never diverge.
 * When the view has sorts, intra-column reorder is disabled (the sort owns
 * row order) and drops resolve to whole-column targets — the group value
 * still changes.
 *
 * **Synced databases:** cards drag ONLY when the group field is a LOCAL
 * field (no `sourceKey`) — a synced group field is written by the sync
 * engine, so boards grouped on it are read-only (the next sync pass would
 * revert any drop). Per-column add-row is hidden for synced databases
 * entirely (rows come from the source), matching the grid's "New row" strip.
 */
export interface DatabaseBoardViewProps {
  database: LocalDatabase;
  /** Full field schema (visibility is a per-view concern, applied here). */
  fields: DatabaseField[];
  mode: "view" | "edit";
  /** Filtered + sorted + formula-merged rows computed by the entry. */
  rows: LocalDatabaseRow[];
  /** The saved view being rendered (`view.type === "board"`). */
  view: DatabaseView;
}

/** Attribute carrying the row id on draggable board cards. */
export const BOARD_CARD_DRAG_ATTRIBUTE = "data-board-card-id";

/** Attribute carrying the column key on board column roots. */
export const BOARD_COLUMN_DRAG_ATTRIBUTE = "data-board-column-id";

const boardCardChannel = createDragChannel("application/x-database-row-id");

/** Rect-map key prefixes so card ids and column keys never collide. */
const CARD_RECT_PREFIX = "card:";
const COLUMN_RECT_PREFIX = "column:";

/** Vertical cap for one column's card stack (its own scroll area). */
const COLUMN_STACK_MAX_HEIGHT_CLASS = "max-h-[520px]";

/**
 * Adapt the drag surface's measured rect map (prefixed keys, see
 * `collectDropRects`) to the pure resolver's structured zones, in the given
 * render-order columns.
 */
function buildDropZonesFromRects(
  columns: readonly BoardColumn[],
  rects: ReadonlyMap<string, DOMRect>
): {
  cardsByColumn: Map<string, BoardCardRect[]>;
  columns: BoardColumnZone[];
} {
  const columnZones: BoardColumnZone[] = [];
  const cardsByColumn = new Map<string, BoardCardRect[]>();
  for (const column of columns) {
    const rect = rects.get(`${COLUMN_RECT_PREFIX}${column.key}`);
    if (!rect) {
      continue;
    }
    columnZones.push({ key: column.key, left: rect.left, right: rect.right });
    const cards: BoardCardRect[] = [];
    for (const row of column.rows) {
      const cardRect = rects.get(`${CARD_RECT_PREFIX}${row.id}`);
      if (cardRect) {
        cards.push({ id: row.id, top: cardRect.top, bottom: cardRect.bottom });
      }
    }
    cardsByColumn.set(column.key, cards);
  }
  return { columns: columnZones, cardsByColumn };
}

/**
 * Apply one card drop: a cross-column drop writes the group field's option
 * id (`null` clears the value for the "No <field>" column); a between-cards
 * drop reorders against the drop neighbor. Board order and table manual
 * order share the same sparse `row.order` key (see module JSDoc), so the
 * within-column neighbor is a global manual-order neighbor too.
 */
function commitBoardDrop(
  field: BoardGroupField,
  row: LocalDatabaseRow,
  target: BoardDropTarget
): void {
  const currentKey = groupKeyForRow(field, row.values[field.id]);
  if (currentKey !== target.columnKey) {
    updateDatabaseCell(
      row.id,
      field.id,
      target.columnKey === "" ? null : target.columnKey
    );
  }
  if (target.kind !== "between") {
    return;
  }
  if (target.beforeCardId) {
    reorderDatabaseRow(row.id, { beforeRowId: target.beforeCardId });
  } else if (target.afterCardId) {
    reorderDatabaseRow(row.id, { afterRowId: target.afterCardId });
  }
}

/** Empty state when the database has no select field to group by. */
function BoardEmptyState({
  database,
  mode,
  view,
}: {
  database: LocalDatabase;
  mode: "view" | "edit";
  view: DatabaseView;
}) {
  const handleAddSelectField = useCallback(() => {
    const field = createDatabaseField("select", "Status");
    addDatabaseField(database.id, field);
    updateDatabaseView(database.id, view.id, {
      // A materialized visible list must adopt the new field explicitly.
      ...(view.visibleFieldIds
        ? { visibleFieldIds: [...view.visibleFieldIds, field.id] }
        : {}),
      config: {
        ...view.config,
        board: { ...view.config.board, groupFieldId: field.id },
      },
    });
  }, [database.id, view.config, view.id, view.visibleFieldIds]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border border-dashed px-4 py-8 text-center">
      <p className="text-muted-foreground text-sm">
        Add a select field to use the board view
      </p>
      {mode === "edit" ? (
        <Button onClick={handleAddSelectField} size="xs" variant="outline">
          <IconPlus />
          Add select field
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Card body shared by the column card and the drag-overlay preview
 * (Linear-style): a two-line clamped title, then one wrapping meta row of
 * property values — select options keep their own pill styling, every other
 * type gets a bordered chip.
 */
function BoardCardContent({
  cardFields,
  primaryField,
  row,
}: {
  cardFields: readonly DatabaseField[];
  primaryField: DatabaseField | undefined;
  row: LocalDatabaseRow;
}) {
  const title = primaryField
    ? formatCellValue(primaryField, row.values[primaryField.id])
    : "";
  // Empty card fields render nothing — no phantom blank chips. Formula
  // markers pre-date coercion; the shared view handles them.
  const metaFields = cardFields.filter(
    (field) =>
      field.type === "formula" ||
      !isCellEmpty(coerceCellValue(field, row.values[field.id]))
  );
  return (
    <>
      <span
        className={cn(
          "line-clamp-2 font-medium text-sm",
          title === "" && "text-muted-foreground"
        )}
      >
        {title === "" ? "Untitled" : title}
      </span>
      {metaFields.length > 0 ? (
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {metaFields.map((field) => (
            <span
              className={cn(
                "flex min-w-0 items-center text-muted-foreground text-xs",
                field.type !== "select" &&
                  field.type !== "multiSelect" &&
                  "rounded-full border border-border px-1.5 py-px"
              )}
              key={field.id}
            >
              {/* mode="edit" keeps URL cells plain text — no nested <a>. */}
              <DatabaseCellValueView
                field={field}
                mode="edit"
                value={row.values[field.id]}
              />
            </span>
          ))}
        </span>
      ) : null}
    </>
  );
}

/**
 * `bg-selection-primary` line above the card whose id the drop target names
 * as `beforeCardId` (rendered in the card's relative wrapper).
 */
function BoardCardDropLine({
  cardId,
  columnKey,
}: {
  cardId: string;
  columnKey: string;
}) {
  const active = useDropTarget<BoardDropTarget, boolean>(
    (target) =>
      target?.kind === "between" &&
      target.columnKey === columnKey &&
      target.beforeCardId === cardId
  );
  if (!active) {
    return null;
  }
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-[5px] z-10 h-[3px] rounded-full bg-selection-primary"
    />
  );
}

/** End-of-column `bg-selection-primary` line (`beforeCardId: null` drops). */
function BoardColumnEndDropLine({ columnKey }: { columnKey: string }) {
  const active = useDropTarget<BoardDropTarget, boolean>(
    (target) =>
      target?.kind === "between" &&
      target.columnKey === columnKey &&
      target.beforeCardId === null
  );
  if (!active) {
    return null;
  }
  return (
    <div aria-hidden className="relative h-0">
      <div className="pointer-events-none absolute inset-x-0 -top-[5px] h-[3px] rounded-full bg-selection-primary" />
    </div>
  );
}

interface BoardCardProps {
  canDrag: boolean;
  cardFields: readonly DatabaseField[];
  columnKey: string;
  databaseId: string;
  primaryField: DatabaseField | undefined;
  row: LocalDatabaseRow;
}

/**
 * One kanban card: a `Link` to the row page, doubling as a drag source in
 * edit mode. The drag gesture (`useDatabaseColumnHeaderDrag`, bound to the
 * row id) disambiguates click vs drag — a plain click navigates, a
 * press-and-move (fine pointers) or long-press-then-move (coarse) lifts the
 * card, and a completed drag suppresses the trailing click so dropping never
 * navigates.
 */
function BoardCard({
  canDrag,
  cardFields,
  columnKey,
  databaseId,
  primaryField,
  row,
}: BoardCardProps) {
  const { headerProps, showGrabbing } = useDatabaseColumnHeaderDrag(row.id);
  const dragProps = canDrag ? headerProps : null;

  return (
    <div className="relative shrink-0">
      <BoardCardDropLine cardId={row.id} columnKey={columnKey} />
      <Link
        className={cn(
          "flex flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5 shadow-xs outline-none transition-shadow hover:shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          canDrag && (showGrabbing ? "cursor-grabbing" : "cursor-pointer")
        )}
        params={{ databaseId, rowId: row.id }}
        to="/db/$databaseId/$rowId"
        {...(dragProps ?? {})}
        data-board-card-id={row.id}
      >
        <BoardCardContent
          cardFields={cardFields}
          primaryField={primaryField}
          row={row}
        />
      </Link>
    </div>
  );
}

interface BoardColumnViewProps {
  canAddRow: boolean;
  canDrag: boolean;
  canEditConfig: boolean;
  cardFields: readonly DatabaseField[];
  column: BoardColumn;
  databaseId: string;
  onAddCard: (column: BoardColumn) => void;
  onHideColumn: (columnKey: string) => void;
  primaryField: DatabaseField | undefined;
}

/**
 * One board column (Linear-style): a tinted well holding the header — status
 * dot + name + muted count, with hover-revealed ⋯ and "+" actions on the
 * right — and the card stack. Adding a card lives on the header "+" (no
 * bottom strip).
 */
function BoardColumnView({
  canAddRow,
  canDrag,
  canEditConfig,
  cardFields,
  column,
  databaseId,
  onAddCard,
  onHideColumn,
  primaryField,
}: BoardColumnViewProps) {
  const colorDef = column.color ? BLOCK_COLOR_DEFS[column.color] : undefined;
  const isColumnTarget = useDropTarget<BoardDropTarget, boolean>(
    (target) => target?.kind === "column" && target.columnKey === column.key
  );

  return (
    <div
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg bg-muted/40 p-1.5 transition-colors",
        isColumnTarget && "bg-selection-primary/10"
      )}
      data-board-column-id={column.key}
    >
      <div
        className="flex h-8 shrink-0 items-center gap-1.5 px-1.5"
        data-reveal-group=""
      >
        {column.value === null ? null : (
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full bg-current",
              colorDef ? colorDef.textClass : "text-muted-foreground"
            )}
          />
        )}
        <span className="truncate font-medium text-sm">{column.label}</span>
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {column.rows.length}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {canEditConfig ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                nativeButton
                render={
                  <Button
                    aria-label={`Column ${column.label} options`}
                    className="hover-reveal shrink-0 text-muted-foreground data-popup-open:opacity-100"
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <IconDots aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    onHideColumn(column.key);
                  }}
                >
                  <IconEyeOff aria-hidden />
                  Hide column
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canAddRow ? (
            <Button
              aria-label={`Add row to column ${column.label}`}
              className="hover-reveal shrink-0 text-muted-foreground"
              onClick={() => {
                onAddCard(column);
              }}
              size="icon-xs"
              variant="ghost"
            >
              <IconPlus aria-hidden />
            </Button>
          ) : null}
        </span>
      </div>
      <div
        className={cn(
          "flex min-h-12 flex-col gap-1.5 overflow-y-auto rounded-md p-0.5",
          COLUMN_STACK_MAX_HEIGHT_CLASS
        )}
      >
        {column.rows.map((row) => (
          <BoardCard
            canDrag={canDrag}
            cardFields={cardFields}
            columnKey={column.key}
            databaseId={databaseId}
            key={row.id}
            primaryField={primaryField}
            row={row}
          />
        ))}
        <BoardColumnEndDropLine columnKey={column.key} />
      </div>
    </div>
  );
}

/** Follow-the-pointer card preview (canvas grammar: 50% opacity, no shadow). */
function BoardCardDragPreview({
  cardFields,
  pointer,
  primaryField,
  row,
}: {
  cardFields: readonly DatabaseField[];
  pointer: { x: number; y: number };
  primaryField: DatabaseField | undefined;
  row: LocalDatabaseRow;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 w-64 opacity-50"
      style={{
        transform: `translate3d(${pointer.x}px, ${pointer.y}px, 0)`,
      }}
    >
      <div className="flex -translate-x-1/2 -translate-y-1/2 flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5 shadow-md">
        <BoardCardContent
          cardFields={cardFields}
          primaryField={primaryField}
          row={row}
        />
      </div>
    </div>
  );
}

/** Drop-accepting horizontal scroll container for the columns. */
function BoardScrollArea({
  children,
  scrollRef,
}: {
  children: ReactNode;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { getDropZoneProps } = useDropZone();
  return (
    <div
      className="flex w-full min-w-0 items-start gap-2 overflow-x-auto pb-2"
      ref={scrollRef}
      {...getDropZoneProps()}
    >
      {children}
    </div>
  );
}

/** Board view for one database view (see module JSDoc for the contract). */
export function DatabaseBoardView({
  database,
  fields,
  mode,
  rows,
  view,
}: DatabaseBoardViewProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [dragRowId, setDragRowId] = useState<string | null>(null);

  const groupField = useMemo(
    () => resolveBoardGroupField(fields, view),
    [fields, view]
  );
  const primaryField = fields.find(
    (field) => field.id === database.primaryFieldId
  );
  const cardFields = useMemo(
    () =>
      groupField
        ? resolveBoardCardFields(
            fields,
            view,
            database.primaryFieldId,
            groupField.id
          )
        : [],
    [database.primaryFieldId, fields, groupField, view]
  );

  const hiddenColumnIds = view.config.board?.hiddenColumnIds;
  const columnSort = view.config.board?.columnSort;
  const hideEmptyColumns = view.config.board?.hideEmptyColumns;
  const { columns, hidden } = useMemo(() => {
    if (!groupField) {
      return { columns: [], hidden: [] };
    }
    return buildBoardColumns({
      columnSort,
      field: groupField,
      hiddenColumnIds,
      hideEmptyColumns,
      rows,
    });
  }, [columnSort, groupField, hiddenColumnIds, hideEmptyColumns, rows]);

  const isSyncedDatabase = database.source?.kind === "connector";
  // Synced-field boards are read-only: the sync engine owns the group
  // field's values, so a drop would be reverted on the next sync pass.
  const canDrag =
    mode === "edit" && groupField !== null && !isSyncedField(groupField);
  // Manual reorder only without sorts — sorted views own intra-column order.
  const allowReorder = !view.sorts || view.sorts.length === 0;
  const canAddRow = mode === "edit" && !isSyncedDatabase;

  // Latest render state in refs so drop resolution never closes over stale
  // columns/rows mid-drag.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const groupFieldRef = useRef(groupField);
  groupFieldRef.current = groupField;
  const allowReorderRef = useRef(allowReorder);
  allowReorderRef.current = allowReorder;

  const config = useMemo<DndSurfaceConfig<BoardDropTarget>>(
    () => ({
      channel: boardCardChannel,
      rowAttribute: BOARD_CARD_DRAG_ATTRIBUTE,
      dragImage: { kind: "overlay" },
      collectDropRects: () => {
        const map = new Map<string, DOMRect>();
        const root = scrollRef.current;
        if (!root) {
          return map;
        }
        for (const element of root.querySelectorAll(
          `[${BOARD_CARD_DRAG_ATTRIBUTE}]`
        )) {
          const id = element.getAttribute(BOARD_CARD_DRAG_ATTRIBUTE);
          if (id) {
            map.set(
              `${CARD_RECT_PREFIX}${id}`,
              element.getBoundingClientRect()
            );
          }
        }
        for (const element of root.querySelectorAll(
          `[${BOARD_COLUMN_DRAG_ATTRIBUTE}]`
        )) {
          const key = element.getAttribute(BOARD_COLUMN_DRAG_ATTRIBUTE);
          if (key !== null) {
            map.set(
              `${COLUMN_RECT_PREFIX}${key}`,
              element.getBoundingClientRect()
            );
          }
        }
        return map;
      },
      resolveDropTarget: ({ sourceId, pointer, rects }) =>
        resolveBoardDropTarget({
          allowReorder: allowReorderRef.current,
          pointer,
          sourceId,
          zones: buildDropZonesFromRects(columnsRef.current, rects),
        }),
      onDrop: ({ sourceId, target }) => {
        const field = groupFieldRef.current;
        const row = rowsRef.current.find((entry) => entry.id === sourceId);
        if (field && row) {
          commitBoardDrop(field, row, target);
        }
      },
      onDragStart: ({ sourceId }) => {
        setDragRowId(sourceId);
      },
      onDragEnd: () => {
        setDragRowId(null);
      },
    }),
    []
  );

  const handleAddCard = useCallback(
    (column: BoardColumn) => {
      // Insert after the column's last card so manual-order views keep the
      // new row inside the column; seed the group cell so it buckets there
      // (the empty column inserts a blank row) — mirrors the grid's
      // per-group add.
      const lastRow = column.rows.at(-1);
      const row = insertDatabaseRow(database.id, { after: lastRow?.id });
      const field = groupFieldRef.current;
      if (field && column.value !== null) {
        updateDatabaseCell(row.id, field.id, column.value);
      }
    },
    [database.id]
  );

  const handleHideColumn = useCallback(
    (columnKey: string) => {
      updateDatabaseView(database.id, view.id, {
        config: {
          ...view.config,
          board: {
            ...view.config.board,
            hiddenColumnIds: [
              ...(view.config.board?.hiddenColumnIds ?? []),
              columnKey,
            ],
          },
        },
      });
    },
    [database.id, view.config, view.id]
  );

  const handleUnhideAll = useCallback(() => {
    updateDatabaseView(database.id, view.id, {
      config: {
        ...view.config,
        // The JSON round-trip in updateDatabaseView drops the undefined key.
        board: { ...view.config.board, hiddenColumnIds: undefined },
      },
    });
  }, [database.id, view.config, view.id]);

  if (!groupField) {
    return <BoardEmptyState database={database} mode={mode} view={view} />;
  }

  const dragRow =
    dragRowId === null
      ? null
      : (rows.find((row) => row.id === dragRowId) ?? null);

  return (
    <DndSurface config={config}>
      <DragOverlay>
        {({ pointer }) =>
          dragRow ? (
            <BoardCardDragPreview
              cardFields={cardFields}
              pointer={pointer}
              primaryField={primaryField}
              row={dragRow}
            />
          ) : null
        }
      </DragOverlay>
      <DatabaseColumnDragAutoScroll scrollRef={scrollRef} />
      <BoardScrollArea scrollRef={scrollRef}>
        {columns.map((column) => (
          <BoardColumnView
            canAddRow={canAddRow}
            canDrag={canDrag}
            canEditConfig={mode === "edit"}
            cardFields={cardFields}
            column={column}
            databaseId={database.id}
            key={`column:${column.key}`}
            onAddCard={handleAddCard}
            onHideColumn={handleHideColumn}
            primaryField={primaryField}
          />
        ))}
        {mode === "edit" && hidden.length > 0 ? (
          <Button
            className="mt-1 shrink-0 text-muted-foreground"
            onClick={handleUnhideAll}
            size="xs"
            variant="ghost"
          >
            + {hidden.length} hidden
          </Button>
        ) : null}
      </BoardScrollArea>
    </DndSurface>
  );
}
