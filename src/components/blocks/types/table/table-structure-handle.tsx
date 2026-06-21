import { IconGripHorizontal, IconGripVertical } from "@tabler/icons-react";
import { useId, useMemo, useState } from "react";
import { TableStructureHandleMenu } from "@/components/blocks/types/table/table-structure-handle-menu.tsx";
import { useCanvasEditorState } from "@/components/canvas/canvas-editor-context.tsx";
import { useDragSource } from "@/components/dnd/use-dnd.ts";
import {
  createDropdownMenuHandle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
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
        <TableStructureHandleMenu
          axis={axis}
          columnIndex={columnIndex}
          onClose={() => {
            setMenuOpen(false);
          }}
          rows={rows}
          tableId={tableId}
          tableRowId={tableRowId}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
