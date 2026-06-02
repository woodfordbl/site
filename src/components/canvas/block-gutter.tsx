import { IconGripVertical, IconPlus } from "@tabler/icons-react";
import type { DragEvent, MouseEvent, PointerEvent } from "react";
import { useRef } from "react";

import {
  canvasBlockActionsTriggerId,
  useCanvasMenu,
} from "@/components/canvas/canvas-menu-context.tsx";
import type { CanvasRowHoverGroup } from "@/components/canvas/canvas-row-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import { setCanvasRowDragData } from "@/lib/canvas/row-drag.ts";
import { cn } from "@/lib/utils.ts";

const canvasRowHoverClass: Record<CanvasRowHoverGroup, string> = {
  "canvas-row": "group-hover/canvas-row:opacity-100",
  "list-item-row": "group-hover/list-item-row:opacity-100",
};

/** List container gutter: show on row hover, but not when a list item row is hovered. */
const listContainerGutterHoverClass =
  "[.group\\/canvas-row:hover:not(:has([data-canvas-list-item-row]:hover))_&]:opacity-100";

function gutterHoverOpacityClass(
  hoverGroup: CanvasRowHoverGroup,
  hideWhenDescendantRowHovered: boolean
): string {
  if (hideWhenDescendantRowHovered) {
    return listContainerGutterHoverClass;
  }
  return canvasRowHoverClass[hoverGroup];
}

/** Wait before showing gutter hints so quick row passes do not flash tooltips. */
const GUTTER_TOOLTIP_DELAY_MS = 700;

/** Keep instant switching between + and grab after the first tooltip opens. */
const GUTTER_TOOLTIP_GROUP_TIMEOUT_MS = 800;

/** Max pointer movement to treat grip release as a click (not a drag). */
const GRIP_CLICK_MOVE_THRESHOLD_PX = 4;

interface BlockGutterProps {
  canTurnInto?: boolean;
  hideWhenDescendantRowHovered?: boolean;
  hoverGroup?: CanvasRowHoverGroup;
  isSelected?: boolean;
  onConvert?: (item: SlashMenuItem) => void;
  onDelete?: () => void;
  onDragEnd?: () => void;
  onDragInteractionStart?: () => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDuplicate?: () => void;
  onInsert: (edge: "before" | "after") => void;
  onMenuOpen?: () => void;
  onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
  rowId: string;
  turnIntoValue?: string;
}

export function BlockGutter({
  rowId,
  onInsert,
  onSelect,
  onMenuOpen,
  onConvert,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragInteractionStart,
  isSelected = false,
  canTurnInto = false,
  turnIntoValue,
  hoverGroup = "canvas-row",
  hideWhenDescendantRowHovered = false,
}: BlockGutterProps) {
  const { closeMenu, handle, open, openBlockActions, payload } =
    useCanvasMenu();
  const didDragRef = useRef(false);
  const suppressClickRef = useRef(false);
  const handledByPointerUpRef = useRef(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const triggerId = canvasBlockActionsTriggerId(rowId);
  const menuOpen =
    open && payload?.kind === "block-actions" && payload.rowId === rowId;

  const openGripMenu = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      onSelect?.(event as unknown as MouseEvent<HTMLButtonElement>);
      return;
    }

    onMenuOpen?.();
    openBlockActions({
      rowId,
      triggerId,
      canTurnInto,
      turnIntoValue,
      onConvert: (item) => onConvert?.(item),
      onDuplicate: () => onDuplicate?.(),
      onDelete: () => onDelete?.(),
    });
  };

  const handleGripPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
    didDragRef.current = false;
    suppressClickRef.current = false;
  };

  const handleGripPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();

    if (didDragRef.current) {
      pointerDownRef.current = null;
      return;
    }

    const start = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!start) {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > GRIP_CLICK_MOVE_THRESHOLD_PX) {
      return;
    }

    handledByPointerUpRef.current = true;
    openGripMenu(event);
  };

  const handleGripClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (suppressClickRef.current || didDragRef.current) {
      suppressClickRef.current = false;
      didDragRef.current = false;
      return;
    }

    if (handledByPointerUpRef.current) {
      handledByPointerUpRef.current = false;
      return;
    }

    openGripMenu(event as unknown as PointerEvent<HTMLButtonElement>);
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    didDragRef.current = true;
    suppressClickRef.current = true;
    pointerDownRef.current = null;
    closeMenu();
    onDragInteractionStart?.();
    setCanvasRowDragData(event.dataTransfer, rowId);
    onDragStart?.(event);
  };

  const handleDragEnd = () => {
    suppressClickRef.current = true;
    onDragEnd?.();
  };

  return (
    <div
      className={cn(
        "flex w-12 items-center justify-end gap-0.5 pr-1 opacity-0 transition-opacity focus-within:opacity-100",
        gutterHoverOpacityClass(hoverGroup, hideWhenDescendantRowHovered)
      )}
    >
      <TooltipProvider
        delay={GUTTER_TOOLTIP_DELAY_MS}
        timeout={GUTTER_TOOLTIP_GROUP_TIMEOUT_MS}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Insert block"
                onClick={(event) => {
                  const edge =
                    event.altKey || event.getModifierState("Alt")
                      ? "before"
                      : "after";
                  onInsert(edge);
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <IconPlus />
              </Button>
            }
          />
          <TooltipContent
            className="flex-col items-start gap-1 py-2"
            side="top"
          >
            <span className="inline-flex items-center gap-1">
              <Kbd>Click</Kbd>
              to add row
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>⌥</Kbd>
              <Kbd>Click</Kbd>
              to add above
            </span>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                handle={handle}
                id={triggerId}
                nativeButton
                payload={{ kind: "block-actions", rowId }}
                render={
                  <Button
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    aria-label="Block actions"
                    aria-pressed={isSelected}
                    className="cursor-grab active:cursor-grabbing"
                    data-canvas-row-select
                    draggable
                    onClick={handleGripClick}
                    onDragEnd={handleDragEnd}
                    onDragStart={handleDragStart}
                    onPointerDown={handleGripPointerDown}
                    onPointerUp={handleGripPointerUp}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <IconGripVertical />
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="top">Block actions or drag</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
