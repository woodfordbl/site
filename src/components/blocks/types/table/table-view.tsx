import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

import { TableCellEdit } from "@/components/blocks/types/table/table-cell-edit.tsx";
import { TableCellView } from "@/components/blocks/types/table/table-cell-view.tsx";
import {
  measureTableColumnDragPreview,
  TableColumnDragPreview,
  type TableColumnDragPreviewState,
} from "@/components/blocks/types/table/table-column-drag-preview.tsx";
import { TableColumnHandle } from "@/components/blocks/types/table/table-column-handle.tsx";
import { TableColumnResizeOverlay } from "@/components/blocks/types/table/table-column-resize-zone.tsx";
import {
  TableAddColumnButton,
  TableAddRowButton,
} from "@/components/blocks/types/table/table-controls.tsx";
import { TableRowHandle } from "@/components/blocks/types/table/table-row-handle.tsx";
import { TableStructureDropIndicators } from "@/components/blocks/types/table/table-structure-drop-indicators.tsx";
import {
  getTableCellStructureSelectionClassName,
  getTableColumnHandleRevealClasses,
  type TableStructureSelection,
} from "@/components/blocks/types/table/table-structure-selection.ts";
import { useTableColumnResize } from "@/components/blocks/types/table/use-table-column-resize.ts";
import {
  useCanvasEditorContext,
  useCanvasFocus,
} from "@/components/canvas/canvas-editor-context.tsx";
import { RowGutter } from "@/components/canvas/row-gutter.tsx";
import {
  DndSurface,
  type DndSurfaceConfig,
} from "@/components/dnd/dnd-surface.tsx";
import { DragOverlay } from "@/components/dnd/drag-overlay.tsx";
import { useDragState, useDropZone } from "@/components/dnd/use-dnd.ts";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area.tsx";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { useTimeout } from "@/hooks/use-timeout.ts";
import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";
import { handleContainerGutterInsert } from "@/lib/canvas/container-gutter-insert.ts";
import {
  deriveTableGrid,
  tableColumnWidthsTotalPx,
} from "@/lib/canvas/table-layout.ts";
import { collectTableColumnDropRects } from "@/lib/dnd/collect-table-column-rects.ts";
import { createDragChannel } from "@/lib/dnd/drag-channel.ts";
import { cn } from "@/lib/utils.ts";

const TABLE_COLUMN_ATTRIBUTE = "data-table-column-drag-id";
const tableColumnChannel = createDragChannel(
  "application/x-table-column-index"
);

function parseColumnDragId(sourceId: string): {
  columnIndex: number;
  tableId: string;
} | null {
  const separator = sourceId.indexOf(":");
  if (separator === -1) {
    return null;
  }
  const tableId = sourceId.slice(0, separator);
  const columnIndex = Number.parseInt(sourceId.slice(separator + 1), 10);
  if (!tableId || Number.isNaN(columnIndex)) {
    return null;
  }
  return { tableId, columnIndex };
}

interface TableColumnDropTarget {
  columnIndex: number;
  edge: "before" | "after";
  tableId: string;
}

/** Matches {@link CANVAS_GUTTER_REVEAL_DELAY_MS} in canvas-row-shell. */
const TABLE_GUTTER_REVEAL_DELAY_MS = 300;
const TABLE_HEADER_CELL_CLASSNAME =
  "relative border border-border bg-muted/40 font-medium";

function TableBlockGutter({
  revealed,
  row,
}: {
  revealed: boolean;
  row: BlockContainerProps["row"];
}) {
  const { insertAfter, insertAtScopeStart, insertBefore } =
    useCanvasEditorContext();

  return (
    <div
      className={cn(
        "pointer-events-auto w-12 shrink-0 pt-3 [&_.canvas-block-gutter]:opacity-0",
        revealed && "[&_.canvas-block-gutter]:opacity-100"
      )}
      data-table-block-gutter
    >
      <RowGutter
        onInsert={(edge) => {
          handleContainerGutterInsert(row, edge, {
            insertAfter,
            insertAtScopeStart,
            insertBefore,
          });
        }}
        row={row}
      />
    </div>
  );
}

function resolveTableColumnDropTarget(args: {
  pointer: { x: number; y: number };
  rects: Map<string, DOMRect>;
  sourceId: string;
}): TableColumnDropTarget | null {
  const parsed = parseColumnDragId(args.sourceId);
  if (!parsed) {
    return null;
  }

  const entries = [...args.rects.entries()].sort(
    (a, b) => a[1].left - b[1].left
  );

  for (const [dragId, rect] of entries) {
    if (!rectContains(args.pointer.x, args.pointer.y, rect)) {
      continue;
    }
    const columnParsed = parseColumnDragId(dragId);
    if (!columnParsed || columnParsed.tableId !== parsed.tableId) {
      continue;
    }
    const edge =
      args.pointer.x < rect.left + rect.width / 2 ? "before" : "after";
    return {
      tableId: parsed.tableId,
      columnIndex: columnParsed.columnIndex,
      edge,
    };
  }

  return null;
}

function rectContains(
  clientX: number,
  clientY: number,
  rect: DOMRect
): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function TableColumnDropZone({ children }: { children: ReactNode }) {
  const { getDropZoneProps } = useDropZone();
  const isDragging = useDragState((state) => state.draggingId != null);

  return (
    <div
      className={cn(
        "relative w-full min-w-0 overflow-visible",
        isDragging &&
          "cursor-grabbing [&_input]:pointer-events-none [&_textarea]:pointer-events-none"
      )}
      {...getDropZoneProps()}
    >
      {children}
    </div>
  );
}

function TableColumnDnD({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  const { dispatch } = useCanvasEditorContext();
  const [previewMeta, setPreviewMeta] = useState<Omit<
    TableColumnDragPreviewState,
    "clientX" | "clientY"
  > | null>(null);

  const config = useMemo<DndSurfaceConfig<TableColumnDropTarget>>(
    () => ({
      channel: tableColumnChannel,
      rowAttribute: TABLE_COLUMN_ATTRIBUTE,
      collectDropRects: collectTableColumnDropRects,
      resolveDropTarget: ({ sourceId, pointer, rects }) =>
        resolveTableColumnDropTarget({ sourceId, pointer, rects }),
      onDrop: ({ sourceId, target }) => {
        const parsed = parseColumnDragId(sourceId);
        if (!parsed) {
          return;
        }
        let toIndex = target.columnIndex;
        if (target.edge === "after") {
          toIndex += 1;
        }
        if (parsed.columnIndex < toIndex) {
          toIndex -= 1;
        }
        dispatch({
          type: "table.reorderColumn",
          tableId: parsed.tableId,
          fromIndex: parsed.columnIndex,
          toIndex,
        });
      },
      dragImage: { kind: "overlay" },
      onDragStart: ({ sourceId, pointer }) => {
        setPreviewMeta(measureTableColumnDragPreview(sourceId, pointer));
      },
      onDragEnd: () => {
        setPreviewMeta(null);
      },
    }),
    [dispatch]
  );

  return (
    <DndSurface config={config}>
      <DragOverlay>
        {({ pointer }) =>
          previewMeta ? (
            <TableColumnDragPreview
              preview={{
                ...previewMeta,
                clientX: pointer.x,
                clientY: pointer.y,
              }}
            />
          ) : null
        }
      </DragOverlay>
      <div className={className} {...props}>
        {children}
      </div>
    </DndSurface>
  );
}

export function TableView({ row, mode }: BlockContainerProps) {
  const grid = deriveTableGrid(row);
  const focus = useCanvasFocus();
  const { clearFocus } = useCanvasEditorContext();
  const { startResize, liveWidths } = useTableColumnResize({
    tableId: grid?.tableId ?? "",
    columnWidths: grid?.columnWidths ?? [1],
  });
  const [structureSelection, setStructureSelection] =
    useState<TableStructureSelection | null>(null);
  const clearStructureSelection = useCallback(() => {
    setStructureSelection(null);
  }, []);
  const selectTableRow = useCallback(
    (tableRowId: string) => {
      if (!grid) {
        return;
      }
      setStructureSelection({
        tableId: grid.tableId,
        tableRowId,
        type: "row",
      });
    },
    [grid]
  );
  const selectTableColumn = useCallback(
    (columnIndex: number) => {
      if (!grid) {
        return;
      }
      setStructureSelection({
        columnIndex,
        tableId: grid.tableId,
        type: "column",
      });
    },
    [grid]
  );
  const handleColumnStructureMenuOpenChange = useCallback(
    (columnIndex: number, open: boolean) => {
      if (open) {
        selectTableColumn(columnIndex);
        return;
      }
      clearStructureSelection();
    },
    [clearStructureSelection, selectTableColumn]
  );
  const handleRowStructureMenuOpenChange = useCallback(
    (tableRowId: string, open: boolean) => {
      if (open) {
        selectTableRow(tableRowId);
        return;
      }
      clearStructureSelection();
    },
    [clearStructureSelection, selectTableRow]
  );

  const tableRowIds = useMemo(
    () => new Set(grid?.rows.map((tableRow) => tableRow.rowId) ?? []),
    [grid?.rows]
  );
  const gutterOpenTimeout = useTimeout();
  const [gutterRevealed, setGutterRevealed] = useState(false);

  const handleTablePointerEnter = () => {
    if (mode !== "edit") {
      return;
    }
    gutterOpenTimeout.clear();
    gutterOpenTimeout.start(TABLE_GUTTER_REVEAL_DELAY_MS, () => {
      setGutterRevealed(true);
    });
  };

  const handleTablePointerLeave = () => {
    gutterOpenTimeout.clear();
    setGutterRevealed(false);
  };

  const tableBlock = row.effectiveBlock;
  if (!grid || tableBlock.type !== "table") {
    return null;
  }

  const widths = liveWidths ?? grid.columnWidths;
  const tableWidthPx = tableColumnWidthsTotalPx(widths);
  const lastRowId =
    grid.rows.at(-1)?.rowId ?? grid.rows[0]?.rowId ?? grid.tableId;
  const rowCount = grid.rows.length;

  const cellSelectionClassName = (
    rowIndex: number,
    columnIndex: number,
    tableRowId: string
  ) =>
    getTableCellStructureSelectionClassName({
      columnCount: grid.columnCount,
      columnIndex,
      rowCount,
      rowIndex,
      selection: structureSelection,
      tableId: grid.tableId,
      tableRowId,
    });

  const columnHandleRevealClasses = getTableColumnHandleRevealClasses(
    grid.columnCount
  );

  return (
    <TableColumnDnD
      className={cn(
        "group/table-layout min-w-0 overflow-visible",
        mode === "edit"
          ? "-mx-12 w-[calc(100%+6rem)]"
          : "-mr-12 w-[calc(100%+3rem)]",
        columnHandleRevealClasses
      )}
      data-table-id={grid.tableId}
      data-table-layout
      onPointerEnter={handleTablePointerEnter}
      onPointerLeave={handleTablePointerLeave}
    >
      <TableColumnDropZone>
        <ScrollArea className="w-full min-w-0 [&_[data-orientation=vertical]]:hidden">
          <div
            className={cn(
              "flex w-max min-w-full flex-col gap-0.5",
              mode === "edit" ? "px-12" : "pl-12"
            )}
          >
            <div
              className={cn(
                "flex w-max",
                mode === "edit"
                  ? "-mx-12 items-start gap-0"
                  : "-ml-12 flex-col gap-0.5"
              )}
            >
              {mode === "edit" ? (
                <TableBlockGutter revealed={gutterRevealed} row={row} />
              ) : null}
              <div className="flex w-max flex-col gap-0.5">
                <div className="relative pt-3 pr-8 pl-3">
                  <div className="relative isolate">
                    <table
                      className={cn(
                        "relative z-0 table-fixed caption-bottom border-collapse text-sm",
                        "[&_tr]:border-0",
                        "[&_td]:overflow-visible",
                        "[&_th]:overflow-visible"
                      )}
                      data-slot="table"
                      style={{ width: tableWidthPx }}
                    >
                      <colgroup>
                        {grid.rows[0]?.cells.map((cell, index) => (
                          <col
                            key={cell.cellId}
                            style={{ width: `${widths[index] ?? 0}px` }}
                          />
                        ))}
                      </colgroup>
                      {grid.hasHeaderRow && grid.rows[0] ? (
                        <TableHeader>
                          <TableRow className="hover:!bg-transparent">
                            {grid.rows[0].cells.map((cell, columnIndex) => {
                              const headerRowId = grid.rows[0].rowId;
                              const selectionClassName = cellSelectionClassName(
                                0,
                                columnIndex,
                                headerRowId
                              );

                              return (
                                <TableHead
                                  className={cn(
                                    TABLE_HEADER_CELL_CLASSNAME,
                                    selectionClassName,
                                    selectionClassName && "z-[1]"
                                  )}
                                  data-table-column-drag-id={`${grid.tableId}:${columnIndex}`}
                                  data-table-column-index={columnIndex}
                                  data-table-last-column={
                                    columnIndex === grid.columnCount - 1
                                      ? ""
                                      : undefined
                                  }
                                  key={cell.cellId}
                                >
                                  {mode === "edit" ? (
                                    <TableColumnHandle
                                      columnIndex={columnIndex}
                                      onStructureMenuOpenChange={(open) => {
                                        handleColumnStructureMenuOpenChange(
                                          columnIndex,
                                          open
                                        );
                                      }}
                                      tableId={grid.tableId}
                                    />
                                  ) : null}
                                  {mode === "edit" ? (
                                    <TableCellEditor
                                      cellRow={findCellRow(row, cell.cellId)}
                                      clearFocus={clearFocus}
                                      focus={focus}
                                    />
                                  ) : (
                                    <TableCellView
                                      props={{ text: cell.text }}
                                    />
                                  )}
                                </TableHead>
                              );
                            })}
                          </TableRow>
                        </TableHeader>
                      ) : null}
                      <TableBody>
                        {grid.rows
                          .slice(grid.hasHeaderRow ? 1 : 0)
                          .map((tableRow, bodyRowIndex) => {
                            const isLastRow = tableRow.rowId === lastRowId;
                            const isColumnHandleRow =
                              !grid.hasHeaderRow && bodyRowIndex === 0;
                            const rowIndex =
                              bodyRowIndex + (grid.hasHeaderRow ? 1 : 0);

                            return (
                              <TableRow
                                className="group/table-row hover:!bg-transparent"
                                data-canvas-row-id={tableRow.rowId}
                                data-table-last-row={isLastRow ? "" : undefined}
                                data-table-row-id={tableRow.rowId}
                                key={tableRow.rowId}
                              >
                                {tableRow.cells.map((cell, columnIndex) => {
                                  const selectionClassName =
                                    cellSelectionClassName(
                                      rowIndex,
                                      columnIndex,
                                      tableRow.rowId
                                    );
                                  const isHeaderColumnCell =
                                    grid.hasHeaderColumn && columnIndex === 0;

                                  return (
                                    <TableCell
                                      className={cn(
                                        "relative border border-border align-top",
                                        isHeaderColumnCell &&
                                          TABLE_HEADER_CELL_CLASSNAME,
                                        selectionClassName,
                                        selectionClassName && "z-[1]"
                                      )}
                                      data-table-column-drag-id={
                                        isColumnHandleRow
                                          ? `${grid.tableId}:${columnIndex}`
                                          : undefined
                                      }
                                      data-table-column-index={columnIndex}
                                      data-table-last-column={
                                        columnIndex === grid.columnCount - 1
                                          ? ""
                                          : undefined
                                      }
                                      key={cell.cellId}
                                    >
                                      {mode === "edit" && columnIndex === 0 ? (
                                        <TableRowHandle
                                          onStructureMenuOpenChange={(open) => {
                                            handleRowStructureMenuOpenChange(
                                              tableRow.rowId,
                                              open
                                            );
                                          }}
                                          rowId={tableRow.rowId}
                                          tableId={grid.tableId}
                                        />
                                      ) : null}
                                      {mode === "edit" && isColumnHandleRow ? (
                                        <TableColumnHandle
                                          columnIndex={columnIndex}
                                          onStructureMenuOpenChange={(open) => {
                                            handleColumnStructureMenuOpenChange(
                                              columnIndex,
                                              open
                                            );
                                          }}
                                          tableId={grid.tableId}
                                        />
                                      ) : null}
                                      {mode === "edit" ? (
                                        <TableCellEditor
                                          cellRow={findCellRow(
                                            row,
                                            cell.cellId
                                          )}
                                          clearFocus={clearFocus}
                                          focus={focus}
                                        />
                                      ) : (
                                        <TableCellView
                                          props={{ text: cell.text }}
                                        />
                                      )}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </table>
                    {mode === "edit" ? (
                      <TableStructureDropIndicators
                        columnWidths={widths}
                        tableId={grid.tableId}
                        tableRowIds={tableRowIds}
                        tableWidthPx={tableWidthPx}
                      />
                    ) : null}
                    {mode === "edit" ? (
                      <TableColumnResizeOverlay
                        columnCount={grid.columnCount}
                        columnWidths={widths}
                        onResizeStart={startResize}
                      />
                    ) : null}
                  </div>
                  {mode === "edit" ? (
                    <div
                      className="pointer-events-none absolute top-3 right-0 bottom-0 z-20 flex w-5"
                      data-table-add-column-host
                    >
                      <TableAddColumnButton
                        className="pointer-events-auto h-full"
                        columnCount={grid.columnCount}
                        tableId={grid.tableId}
                      />
                    </div>
                  ) : null}
                </div>
                {mode === "edit" ? (
                  <div
                    className="group/add-row-host pr-3 pl-3"
                    data-table-add-row-host
                  >
                    <div style={{ width: tableWidthPx }}>
                      <TableAddRowButton
                        lastRowId={lastRowId}
                        rowCount={rowCount}
                        tableId={grid.tableId}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {mode === "edit" ? <ScrollBar orientation="horizontal" /> : null}
        </ScrollArea>
      </TableColumnDropZone>
    </TableColumnDnD>
  );
}

function findCellRow(
  tableCanvasRow: BlockContainerProps["row"],
  cellId: string
): BlockContainerProps["row"] | undefined {
  for (const row of tableCanvasRow.children) {
    for (const cell of row.children) {
      if (cell.rowId === cellId) {
        return cell;
      }
    }
  }
  return;
}

function TableCellEditor({
  cellRow,
  clearFocus,
  focus,
}: {
  cellRow: BlockContainerProps["row"] | undefined;
  clearFocus: () => void;
  focus: ReturnType<typeof useCanvasFocus>;
}) {
  const { dispatch } = useCanvasEditorContext();

  if (cellRow?.effectiveBlock.type !== "tableCell") {
    return null;
  }

  const block = cellRow.effectiveBlock;
  const isFocusTarget = focus?.rowId === cellRow.rowId;

  return (
    <TableCellEdit
      autoFocus={isFocusTarget}
      autoFocusOffset={isFocusTarget ? focus?.offset : undefined}
      autoFocusPlacement={isFocusTarget ? focus?.placement : undefined}
      onAutoFocusHandled={clearFocus}
      onChange={(nextProps) => {
        dispatch({
          type: "row.update",
          rowId: cellRow.rowId,
          block: { ...block, props: nextProps },
        });
      }}
      props={block.props}
      row={cellRow}
    />
  );
}
