import { IconGripHorizontal, IconGripVertical } from "@tabler/icons-react";
import {
  type CSSProperties,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
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

interface TableStructureGripVisualsProps {
  axis: TableStructureHandleAxis;
  GripIcon: typeof IconGripHorizontal;
  gripPadding: string;
  isAccentState: boolean;
}

function TableStructureGripVisuals({
  axis,
  gripPadding,
  isAccentState,
  GripIcon,
}: TableStructureGripVisualsProps) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute shrink-0 rounded-full transition-colors duration-0",
          axis === "row" ? "h-5 w-0.5" : "h-0.5 w-5",
          isAccentState ? "bg-primary" : "bg-border",
          isAccentState && "opacity-0"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "relative z-10 shrink-0 rounded-full bg-muted-foreground transition-opacity duration-0",
          axis === "row" ? "mx-px h-4 w-0.5" : "mx-px h-0.5 w-5",
          "group-hover/handle:opacity-0 group-focus-visible/handle:opacity-0",
          isAccentState && "opacity-0"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "absolute z-10 flex items-center justify-center rounded-sm border border-border bg-background transition-[opacity,border-color,color] duration-0",
          gripPadding,
          "opacity-0",
          !isAccentState &&
            "group-hover/handle:text-muted-foreground group-hover/handle:opacity-100",
          !isAccentState &&
            "group-focus-visible/handle:text-muted-foreground group-focus-visible/handle:opacity-100",
          isAccentState &&
            "border-primary bg-primary text-primary-foreground opacity-100"
        )}
      >
        <GripIcon className="size-3 shrink-0" />
      </span>
    </>
  );
}

interface TableStructureHandleProps {
  axis: TableStructureHandleAxis;
  columnIndex?: number;
  dragId: string;
  onStructureMenuOpenChange?: (open: boolean) => void;
  revealGroupClassName?: string;
  tableId: string;
  tableRowId?: string;
  useCanvasRowSurface?: boolean;
}

export function TableStructureHandle({
  axis,
  columnIndex,
  dragId,
  onStructureMenuOpenChange,
  revealGroupClassName = "",
  tableId,
  tableRowId,
  useCanvasRowSurface = false,
}: TableStructureHandleProps) {
  const triggerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuHandle = useMemo(() => createDropdownMenuHandle(), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const { rows } = useCanvasEditorState();

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open);
      onStructureMenuOpenChange?.(open);
    },
    [onStructureMenuOpenChange]
  );

  const { getSourceProps, isDragging, showGrabbing } = useDragSource({
    id: dragId,
    // Column grips reorder horizontally, row grips vertically; lock the touch
    // drag to that axis so the orthogonal scroll (table ScrollArea / page) wins.
    dragAxis: axis === "row" ? "y" : "x",
    haptics: true,
    useCanvasRowSurface,
    onClickWithoutDrag: () => {
      handleMenuOpenChange(true);
    },
    onDragInteractionStart: () => {
      handleMenuOpenChange(false);
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
  const gripPadding =
    axis === "row" ? "mx-px px-0.5 py-1" : "mx-px px-1 py-0.5";

  return (
    <DropdownMenu
      handle={menuHandle}
      modal={false}
      onOpenChange={handleMenuOpenChange}
      open={menuOpen}
      triggerId={triggerId}
    >
      <div
        className={cn(
          "pointer-events-none absolute z-30",
          axis === "row"
            ? "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2"
            : "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
          isDragging && "opacity-0"
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
                "hover-reveal cursor-pointer active:cursor-grabbing",
                "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                axis === "row" ? "h-5 w-3" : "h-3 w-5",
                // Touch-only hit slop: a `::before` enlarges the tap target to
                // ~44px without moving the visual grip or affecting layout. The
                // slop is biased away from editable cells (column → up, row →
                // left) so it doesn't steal taps meant for cell content.
                "before:absolute before:content-['']",
                axis === "row"
                  ? "hover-none:before:-inset-y-3 hover-none:before:-right-1 hover-none:before:-left-4"
                  : "hover-none:before:-inset-x-3 hover-none:before:-top-4 hover-none:before:-bottom-1",
                revealGroupClassName,
                "hover:opacity-100 focus-visible:opacity-100",
                (menuOpen || showGrabbing) && "opacity-100",
                (showGrabbing || isDragging) && "cursor-grabbing"
              )}
              data-table-column-handle={
                axis === "column" ? columnIndex : undefined
              }
              data-table-structure-handle
              ref={triggerRef}
              style={{ "--reveal-duration": "0ms" } as CSSProperties}
              type="button"
            >
              <TableStructureGripVisuals
                axis={axis}
                GripIcon={GripIcon}
                gripPadding={gripPadding}
                isAccentState={isAccentState}
              />
            </button>
          }
        />
      </div>
      <DropdownMenuContent
        align="start"
        anchor={triggerRef}
        className="min-w-56 duration-0 data-closed:animate-none data-closed:duration-0"
        data-table-structure-menu
        finalFocus={false}
        side={axis === "row" ? "right" : "bottom"}
        sideOffset={6}
      >
        <TableStructureHandleMenu
          axis={axis}
          columnIndex={columnIndex}
          menuOpen={menuOpen}
          onClose={() => {
            handleMenuOpenChange(false);
          }}
          rows={rows}
          tableId={tableId}
          tableRowId={tableRowId}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
