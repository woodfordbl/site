import { type ComponentProps, useCallback, useMemo, useState } from "react";

import { TableCellEdit } from "@/components/blocks/types/table/table-cell-edit.tsx";
import { TableCellView } from "@/components/blocks/types/table/table-cell-view.tsx";
import { TableColumnHandle } from "@/components/blocks/types/table/table-column-handle.tsx";
import { TableColumnResizeOverlay } from "@/components/blocks/types/table/table-column-resize-zone.tsx";
import {
  TableAddColumnButton,
  TableAddRowButton,
} from "@/components/blocks/types/table/table-controls.tsx";
import { TableRowHandle } from "@/components/blocks/types/table/table-row-handle.tsx";
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
import {
  DndSurface,
  type DndSurfaceConfig,
} from "@/components/dnd/dnd-surface.tsx";
import { useDropTarget, useDropZone } from "@/components/dnd/use-dnd.ts";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area.tsx";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";
import {
  deriveTableGrid,
  tableColumnWidthsTotalPx,
} from "@/lib/canvas/table-layout.ts";
import { createDragChannel } from "@/lib/dnd/drag-channel.ts";
import { cn } from "@/lib/utils.ts";

const TABLE_COLUMN_ATTRIBUTE = "data-table-column-drag-id";
const tableColumnChannel = createDragChannel(
  "application/x-table-column-index"
);

interface TableColumnDropTarget {
  columnIndex: number;
  edge: "before" | "after";
  tableId: string;
}

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

function TableColumnDropIndicator({
  columnIndex,
  tableId,
}: {
  columnIndex: number;
  tableId: string;
}) {
  const indicator = useDropTarget((target: TableColumnDropTarget | null) => {
    if (!target || target.tableId !== tableId) {
      return null;
    }
    if (target.edge === "before" && target.columnIndex === columnIndex) {
      return "before";
    }
    if (target.edge === "after" && target.columnIndex === columnIndex) {
      return "after";
    }
    return null;
  });

  if (!indicator) {
    return null;
  }

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-selection",
        indicator === "before" ? "left-0" : "right-0"
      )}
    />
  );
}

function TableColumnDnD({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  const { dispatch } = useCanvasEditorContext();
  const { getDropZoneProps } = useDropZone();

  const config = useMemo<DndSurfaceConfig<TableColumnDropTarget>>(
    () => ({
      channel: tableColumnChannel,
      rowAttribute: TABLE_COLUMN_ATTRIBUTE,
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
    }),
    [dispatch]
  );

  return (
    <DndSurface config={config}>
      <div {...getDropZoneProps()} className={className} {...props}>
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
        "group/table-layout -mr-12 w-[calc(100%+3rem)] min-w-0 overflow-visible",
        columnHandleRevealClasses
      )}
      data-table-id={grid.tableId}
      data-table-layout
    >
      <div className="relative w-full min-w-0 overflow-visible">
        <ScrollArea className="w-full min-w-0 [&_[data-orientation=vertical]]:hidden">
          <div className="flex w-max min-w-full flex-col gap-0.5 pl-12">
            <div className="-ml-12 flex w-max flex-col gap-0.5">
              <div className="relative pt-3 pr-3 pl-3">
                <div className="relative isolate">
                  <table
                    className={cn(
                      "relative z-0 table-fixed caption-bottom border-collapse text-sm",
                      "[&_tr]:border-0",
                      "[&_td]:overflow-visible [&_td]:border [&_td]:border-border",
                      "[&_th]:overflow-visible [&_th]:border [&_th]:border-border"
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
                        <TableRow className="hover:bg-transparent">
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
                                  "relative bg-muted/40 font-medium",
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
                                <TableColumnDropIndicator
                                  columnIndex={columnIndex}
                                  tableId={grid.tableId}
                                />
                                {mode === "edit" ? (
                                  <TableColumnHandle
                                    columnIndex={columnIndex}
                                    onStructureSelect={() => {
                                      selectTableColumn(columnIndex);
                                    }}
                                    tableId={grid.tableId}
                                  />
                                ) : null}
                                {mode === "edit" ? (
                                  <TableCellEditor
                                    cellRow={findCellRow(row, cell.cellId)}
                                    clearFocus={clearFocus}
                                    clearStructureSelection={
                                      clearStructureSelection
                                    }
                                    focus={focus}
                                  />
                                ) : (
                                  <TableCellView props={{ text: cell.text }} />
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
                              className="group/table-row hover:bg-muted/20"
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

                                return (
                                  <TableCell
                                    className={cn(
                                      "relative align-top",
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
                                        onStructureSelect={() => {
                                          selectTableRow(tableRow.rowId);
                                        }}
                                        rowId={tableRow.rowId}
                                        tableId={grid.tableId}
                                      />
                                    ) : null}
                                    {mode === "edit" && isColumnHandleRow ? (
                                      <>
                                        <TableColumnDropIndicator
                                          columnIndex={columnIndex}
                                          tableId={grid.tableId}
                                        />
                                        <TableColumnHandle
                                          columnIndex={columnIndex}
                                          onStructureSelect={() => {
                                            selectTableColumn(columnIndex);
                                          }}
                                          tableId={grid.tableId}
                                        />
                                      </>
                                    ) : null}
                                    {mode === "edit" ? (
                                      <TableCellEditor
                                        cellRow={findCellRow(row, cell.cellId)}
                                        clearFocus={clearFocus}
                                        clearStructureSelection={
                                          clearStructureSelection
                                        }
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
                <div className="pr-3 pl-3">
                  <div style={{ width: tableWidthPx }}>
                    <TableAddRowButton lastRowId={lastRowId} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {mode === "edit" ? <ScrollBar orientation="horizontal" /> : null}
        </ScrollArea>
      </div>
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
  clearStructureSelection,
  focus,
}: {
  cellRow: BlockContainerProps["row"] | undefined;
  clearFocus: () => void;
  clearStructureSelection: () => void;
  focus: ReturnType<typeof useCanvasFocus>;
}) {
  const { dispatch } = useCanvasEditorContext();

  if (!cellRow || cellRow.effectiveBlock.type !== "tableCell") {
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
      onCellFocus={clearStructureSelection}
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
