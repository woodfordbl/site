import {
  IconArrowLeft,
  IconArrowRight,
  IconCircleX,
  IconCopy,
  IconGripHorizontal,
  IconGripVertical,
  IconTrash,
} from "@tabler/icons-react";
import { useId, useMemo, useState } from "react";

import {
  useCanvasEditorContext,
  useCanvasEditorState,
} from "@/components/canvas/canvas-editor-context.tsx";
import { useDragSource } from "@/components/dnd/use-dnd.ts";
import {
  createDropdownMenuHandle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { findRowById } from "@/lib/blocks/block-tree.ts";
import { cn } from "@/lib/utils.ts";

type TableStructureHandleAxis = "column" | "row";

interface TableStructureHandleProps {
  axis: TableStructureHandleAxis;
  columnIndex?: number;
  dragId: string;
  onStructureSelect?: () => void;
  revealGroupClassName?: string;
  tableId: string;
  tableRowId?: string;
  useCanvasRowSurface?: boolean;
}

export function TableStructureHandle({
  axis,
  columnIndex,
  dragId,
  onStructureSelect,
  revealGroupClassName = "",
  tableId,
  tableRowId,
  useCanvasRowSurface = false,
}: TableStructureHandleProps) {
  const triggerId = useId();
  const menuHandle = useMemo(() => createDropdownMenuHandle(), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const { dispatch, duplicateRow } = useCanvasEditorContext();
  const { rows } = useCanvasEditorState();

  const { getSourceProps, showGrabbing } = useDragSource({
    id: dragId,
    useCanvasRowSurface,
    onClickWithoutDrag: () => {
      onStructureSelect?.();
      setMenuOpen(true);
    },
    onDragInteractionStart: () => {
      setMenuOpen(false);
    },
  });

  const sourceProps = getSourceProps({
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onPointerUp: (event) => {
      event.stopPropagation();
    },
  });

  const GripIcon = axis === "row" ? IconGripVertical : IconGripHorizontal;
  const isAccentState = menuOpen || showGrabbing;
  const closeMenu = () => {
    setMenuOpen(false);
  };

  const clearRowContents = () => {
    if (!tableRowId) {
      return;
    }
    const row = findRowById(rows, tableRowId);
    if (!row) {
      return;
    }
    for (const cell of row.children) {
      const block = cell.effectiveBlock;
      if (block.type !== "tableCell" || block.props.text.length === 0) {
        continue;
      }
      dispatch({
        type: "row.update",
        rowId: cell.rowId,
        block: { ...block, props: { text: "" } },
      });
    }
  };

  const clearColumnContents = () => {
    if (columnIndex === undefined) {
      return;
    }
    const tableRow = findRowById(rows, tableId);
    if (!tableRow) {
      return;
    }
    for (const row of tableRow.children) {
      const cell = row.children[columnIndex];
      const block = cell?.effectiveBlock;
      if (
        !cell ||
        block?.type !== "tableCell" ||
        block.props.text.length === 0
      ) {
        continue;
      }
      dispatch({
        type: "row.update",
        rowId: cell.rowId,
        block: { ...block, props: { text: "" } },
      });
    }
  };

  return (
    <DropdownMenu
      handle={menuHandle}
      modal={false}
      onOpenChange={setMenuOpen}
      open={menuOpen}
      triggerId={triggerId}
    >
      <div
        className={cn(
          "pointer-events-none absolute z-30",
          axis === "row"
            ? "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2"
            : "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
        )}
      >
        <DropdownMenuTrigger
          id={triggerId}
          nativeButton
          render={
            <button
              {...sourceProps}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={axis === "row" ? "Row actions" : "Column actions"}
              className={cn(
                "group/handle pointer-events-auto relative flex items-center justify-center",
                "transition-opacity duration-0",
                "cursor-pointer opacity-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                axis === "row" ? "h-5 w-3" : "h-3 w-5",
                revealGroupClassName,
                "hover:opacity-100 focus-visible:opacity-100",
                (menuOpen || showGrabbing) && "opacity-100",
                showGrabbing && "cursor-grabbing"
              )}
              data-table-column-handle={
                axis === "column" ? columnIndex : undefined
              }
              data-table-structure-handle
              type="button"
            >
              <span
                aria-hidden
                className={cn(
                  "absolute shrink-0 rounded-full transition-colors duration-0",
                  axis === "row" ? "h-5 w-px" : "h-px w-5",
                  isAccentState ? "bg-accent" : "bg-border"
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "relative z-10 shrink-0 rounded-full bg-muted-foreground transition-opacity duration-0",
                  axis === "row" ? "mx-px h-4 w-1" : "mx-px h-1 w-5",
                  "group-hover/handle:opacity-0 group-focus-visible/handle:opacity-0",
                  isAccentState && "opacity-0"
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "absolute z-10 flex items-center justify-center rounded-sm border transition-[opacity,background-color,border-color,color] duration-0",
                  axis === "row" ? "mx-px px-0.5 py-1" : "mx-px px-1 py-0.5",
                  "border-transparent opacity-0",
                  !isAccentState &&
                    "group-hover/handle:border-border group-hover/handle:bg-background group-hover/handle:text-muted-foreground group-hover/handle:opacity-100",
                  !isAccentState &&
                    "group-focus-visible/handle:border-border group-focus-visible/handle:bg-background group-focus-visible/handle:text-muted-foreground group-focus-visible/handle:opacity-100",
                  isAccentState &&
                    "border-border bg-accent text-accent-foreground opacity-100"
                )}
              >
                <GripIcon className="size-3 shrink-0" />
              </span>
            </button>
          }
        />
      </div>
      <DropdownMenuContent
        align="center"
        className="min-w-56 duration-0 data-closed:animate-none data-closed:duration-0"
        data-table-structure-menu
        finalFocus={false}
        side={axis === "row" ? "right" : "bottom"}
        sideOffset={6}
      >
        {axis === "row" && tableRowId ? (
          <>
            <DropdownMenuItem
              onClick={() => {
                dispatch({
                  type: "table.addRow",
                  tableRowId,
                  edge: "before",
                });
                closeMenu();
              }}
            >
              <IconArrowLeft />
              Insert above
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                dispatch({
                  type: "table.addRow",
                  tableRowId,
                  edge: "after",
                });
                closeMenu();
              }}
            >
              <IconArrowRight />
              Insert below
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                duplicateRow(tableRowId);
                closeMenu();
              }}
            >
              <IconCopy />
              Duplicate
              <Kbd className="ml-auto">⌘D</Kbd>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                clearRowContents();
                closeMenu();
              }}
            >
              <IconCircleX />
              Clear contents
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                dispatch({ type: "table.removeRow", tableRowId });
                closeMenu();
              }}
              variant="destructive"
            >
              <IconTrash />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
        {axis === "column" && columnIndex !== undefined ? (
          <>
            <DropdownMenuItem
              onClick={() => {
                dispatch({
                  type: "table.addColumn",
                  tableId,
                  columnIndex,
                  edge: "before",
                });
                closeMenu();
              }}
            >
              <IconArrowLeft />
              Insert left
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                dispatch({
                  type: "table.addColumn",
                  tableId,
                  columnIndex,
                  edge: "after",
                });
                closeMenu();
              }}
            >
              <IconArrowRight />
              Insert right
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                dispatch({
                  type: "table.duplicateColumn",
                  tableId,
                  columnIndex,
                });
                closeMenu();
              }}
            >
              <IconCopy />
              Duplicate
              <Kbd className="ml-auto">⌘D</Kbd>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                clearColumnContents();
                closeMenu();
              }}
            >
              <IconCircleX />
              Clear contents
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                dispatch({
                  type: "table.removeColumn",
                  tableId,
                  columnIndex,
                });
                closeMenu();
              }}
              variant="destructive"
            >
              <IconTrash />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
