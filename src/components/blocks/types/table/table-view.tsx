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
import { TableRowResizeZone } from "@/components/blocks/types/table/table-row-resize-zone.tsx";
import { TableStructureDropIndicators } from "@/components/blocks/types/table/table-structure-drop-indicators.tsx";
import {
  getTableCellStructureSelectionClassName,
  getTableColumnHandleRevealClasses,
  type TableStructureSelection,
} from "@/components/blocks/types/table/table-structure-selection.ts";
import { useTableColumnResize } from "@/components/blocks/types/table/use-table-column-resize.ts";
import { useTableRowResize } from "@/components/blocks/types/table/use-table-row-resize.ts";
import {
  useCanvasEditorContext,
  useCanvasFocus,
} from "@/components/canvas/canvas-editor-context.tsx";
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
import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";
import {
  deriveTableGrid,
  type TableGrid,
  tableColumnWidthsTotalPx,
} from "@/lib/canvas/table-layout.ts";
import { collectTableColumnDropRects } from "@/lib/dnd/collect-table-column-rects.ts";
import { createDragChannel } from "@/lib/dnd/drag-channel.ts";
import { usePageContentLayout } from "@/lib/pages/page-content-layout-context.tsx";
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

const TABLE_HEADER_CELL_CLASSNAME =
  "relative border border-border bg-muted/40 font-medium";

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

/** Panel-edge bleed classes for tables when the page uses full panel width. */
function tableLayoutBleedClassNames(options: {
  mode: BlockContainerProps["mode"];
  useFullPanelWidth: boolean;
}): {
  innerFlexClassName: string;
  outerClassName: string;
  scrollPaddingClassName: string;
} {
  const { mode, useFullPanelWidth } = options;

  if (!useFullPanelWidth) {
    return {
      outerClassName: "w-full",
      scrollPaddingClassName: "",
      innerFlexClassName:
        mode === "edit" ? "items-start gap-0" : "flex-col gap-0.5",
    };
  }

  // The left edge stays aligned with page content (pl-12 cancels the -ml-12
  // pull); only the right edge bleeds out to the panel so wide tables get more
  // room. Edit and view differ only in the inner flow direction.
  return {
    outerClassName: "w-full md:-mr-12 md:w-[calc(100%+3rem)]",
    scrollPaddingClassName: "pl-12",
    innerFlexClassName:
      mode === "edit" ? "-ml-12 items-start gap-0" : "-ml-12 flex-col gap-0.5",
  };
}

export function TableView({ row, mode }: BlockContainerProps) {
  const grid = deriveTableGrid(row);
  const { useFullPanelWidth } = usePageContentLayout();
  const focus = useCanvasFocus();
  const { clearFocus, dispatch } = useCanvasEditorContext();
  const { startResize, liveWidths } = useTableColumnResize({
    tableId: grid?.tableId ?? "",
    columnWidths: grid?.columnWidths ?? [1],
  });
  const { startRowResize, liveRowHeight } = useTableRowResize();
  const resetRowHeight = useCallback(
    (tableRowId: string) => {
      dispatch({ type: "table.resetRowHeight", tableRowId });
    },
    [dispatch]
  );
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

  const tableBlock = row.effectiveBlock;
  if (!grid || tableBlock.type !== "table") {
    return null;
  }

  const widths = liveWidths ?? grid.columnWidths;
  const tableWidthPx = tableColumnWidthsTotalPx(widths);
  const lastRowId =
    grid.rows.at(-1)?.rowId ?? grid.rows[0]?.rowId ?? grid.tableId;
  const rowCount = grid.rows.length;

  /** Live drag height overrides the persisted height for the row being resized. */
  const resolveRowHeight = (tableRowId: string, persisted?: number) =>
    liveRowHeight?.tableRowId === tableRowId ? liveRowHeight.height : persisted;

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
  const tableBleed = tableLayoutBleedClassNames({ mode, useFullPanelWidth });

  return (
    <TableColumnDnD
      className={cn(
        "group/table-layout min-w-0 overflow-visible",
        tableBleed.outerClassName,
        columnHandleRevealClasses
      )}
      data-table-id={grid.tableId}
      data-table-layout
    >
      <TableColumnDropZone>
        <ScrollArea className="w-full min-w-0 [&_[data-orientation=vertical]]:hidden">
          <div
            className={cn(
              "flex w-max min-w-full flex-col gap-0.5",
              tableBleed.scrollPaddingClassName
            )}
          >
            <div className={cn("flex w-max", tableBleed.innerFlexClassName)}>
              <div className="flex w-max flex-col gap-0.5">
                <div className="relative pt-3 pr-8 pl-1.5" data-table-frame>
                  <div className="relative isolate">
                    <table
                      className={cn(
                        "relative z-0 table-fixed caption-bottom border-collapse text-[length:calc(0.875rem*var(--page-text-scale))]",
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
                          <TableRow
                            className="hover:!bg-transparent"
                            data-table-row-id={grid.rows[0].rowId}
                            style={{
                              height: resolveRowHeight(
                                grid.rows[0].rowId,
                                grid.rows[0].height
                              ),
                            }}
                          >
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
                                  {mode === "edit" && columnIndex === 0 ? (
                                    <TableRowResizeZone
                                      onReset={resetRowHeight}
                                      onResizeStart={startRowResize}
                                      tableRowId={headerRowId}
                                      tableWidthPx={tableWidthPx}
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
                                style={{
                                  height: resolveRowHeight(
                                    tableRow.rowId,
                                    tableRow.height
                                  ),
                                }}
                              >
                                {tableRow.cells.map((cell, columnIndex) => (
                                  <TableBodyCell
                                    cellRow={findCellRow(row, cell.cellId)}
                                    cellText={cell.text}
                                    clearFocus={clearFocus}
                                    columnIndex={columnIndex}
                                    focus={focus}
                                    grid={grid}
                                    isColumnHandleRow={isColumnHandleRow}
                                    key={cell.cellId}
                                    mode={mode}
                                    onColumnMenuOpenChange={
                                      handleColumnStructureMenuOpenChange
                                    }
                                    onRowMenuOpenChange={
                                      handleRowStructureMenuOpenChange
                                    }
                                    onRowResizeReset={resetRowHeight}
                                    onRowResizeStart={startRowResize}
                                    selectionClassName={cellSelectionClassName(
                                      rowIndex,
                                      columnIndex,
                                      tableRow.rowId
                                    )}
                                    tableRowId={tableRow.rowId}
                                    tableWidthPx={tableWidthPx}
                                  />
                                ))}
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
                    className="group/add-row-host pr-3 pl-1.5"
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

interface TableBodyCellProps {
  cellRow: BlockContainerProps["row"] | undefined;
  cellText: string;
  clearFocus: () => void;
  columnIndex: number;
  focus: ReturnType<typeof useCanvasFocus>;
  grid: TableGrid;
  isColumnHandleRow: boolean;
  mode: BlockContainerProps["mode"];
  onColumnMenuOpenChange: (columnIndex: number, open: boolean) => void;
  onRowMenuOpenChange: (tableRowId: string, open: boolean) => void;
  onRowResizeReset: ComponentProps<typeof TableRowResizeZone>["onReset"];
  onRowResizeStart: ComponentProps<typeof TableRowResizeZone>["onResizeStart"];
  selectionClassName: string | undefined;
  tableRowId: string;
  tableWidthPx: number;
}

function TableBodyCell({
  cellRow,
  cellText,
  clearFocus,
  columnIndex,
  focus,
  grid,
  isColumnHandleRow,
  mode,
  onColumnMenuOpenChange,
  onRowMenuOpenChange,
  onRowResizeReset,
  onRowResizeStart,
  selectionClassName,
  tableRowId,
  tableWidthPx,
}: TableBodyCellProps) {
  const isHeaderColumnCell = grid.hasHeaderColumn && columnIndex === 0;
  const isFirstColumn = columnIndex === 0;
  const editable = mode === "edit";

  return (
    <TableCell
      className={cn(
        "relative border border-border align-top",
        isHeaderColumnCell && TABLE_HEADER_CELL_CLASSNAME,
        selectionClassName,
        selectionClassName && "z-[1]"
      )}
      data-table-column-drag-id={
        isColumnHandleRow ? `${grid.tableId}:${columnIndex}` : undefined
      }
      data-table-column-index={columnIndex}
      data-table-last-column={
        columnIndex === grid.columnCount - 1 ? "" : undefined
      }
    >
      {editable && isFirstColumn ? (
        <>
          <TableRowHandle
            onStructureMenuOpenChange={(open) => {
              onRowMenuOpenChange(tableRowId, open);
            }}
            rowId={tableRowId}
            tableId={grid.tableId}
          />
          <TableRowResizeZone
            onReset={onRowResizeReset}
            onResizeStart={onRowResizeStart}
            tableRowId={tableRowId}
            tableWidthPx={tableWidthPx}
          />
        </>
      ) : null}
      {editable && isColumnHandleRow ? (
        <TableColumnHandle
          columnIndex={columnIndex}
          onStructureMenuOpenChange={(open) => {
            onColumnMenuOpenChange(columnIndex, open);
          }}
          tableId={grid.tableId}
        />
      ) : null}
      {editable ? (
        <TableCellEditor
          cellRow={cellRow}
          clearFocus={clearFocus}
          focus={focus}
        />
      ) : (
        <TableCellView props={{ text: cellText }} />
      )}
    </TableCell>
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
