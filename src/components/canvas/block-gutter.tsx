import { IconGripVertical, IconPlus } from "@tabler/icons-react";
import type { MouseEvent, PointerEvent } from "react";
import { useRef, useState } from "react";
import {
  BlockActionsMenu,
  BlockActionsMenuContent,
  BlockActionsMenuTrigger,
  useBlockActionsMenu,
} from "@/components/canvas/block-actions-menu.tsx";
import type { BlockViewOption } from "@/components/canvas/block-gutter-menu.tsx";
import { BlockGutterMenu } from "@/components/canvas/block-gutter-menu.tsx";
import { useCanvasMenu } from "@/components/canvas/canvas-menu-context.tsx";
import { useDragSource } from "@/components/dnd/use-dnd.ts";
import { Button } from "@/components/ui/button.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { POINTER_CLICK_DRAG_THRESHOLD_PX } from "@/hooks/use-pointer-click-vs-drag.ts";
import { canvasGutterBodyFirstLineClassName } from "@/lib/blocks/block-spacing.ts";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

/** Wait before showing gutter hints so quick row passes do not flash tooltips. */
const GUTTER_TOOLTIP_DELAY_MS = 700;

/** Keep instant switching between + and grab after the first tooltip opens. */
const GUTTER_TOOLTIP_GROUP_TIMEOUT_MS = 800;

interface BlockGutterProps {
  alignClassName?: string;
  canTurnInto?: boolean;
  isSelected?: boolean;
  onConvert?: (item: SlashMenuItem) => void;
  onDelete?: () => void;
  onDragInteractionStart?: () => void;
  onDuplicate?: () => void;
  onInsert: (edge: "before" | "after") => void;
  onMenuOpen?: () => void;
  onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
  rowId: string;
  turnIntoValue?: string;
  viewOptions?: {
    items: BlockViewOption[];
    label: string;
  };
}

export function BlockGutter({
  rowId,
  alignClassName = canvasGutterBodyFirstLineClassName,
  onInsert,
  onSelect,
  onMenuOpen,
  onConvert,
  onDuplicate,
  onDelete,
  onDragInteractionStart,
  isSelected = false,
  canTurnInto = false,
  turnIntoValue,
  viewOptions,
}: BlockGutterProps) {
  const { openRowId, setOpenRowId } = useBlockActionsMenu();
  const { closeMenu: closeSlashMenu } = useCanvasMenu();
  const menuOpen = openRowId === rowId;
  const [isPointerMoving, setIsPointerMoving] = useState(false);
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null);

  const openGripMenu = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      onSelect?.(event as unknown as MouseEvent<HTMLButtonElement>);
      return;
    }

    onMenuOpen?.();
    closeSlashMenu();
    setOpenRowId(rowId);
  };

  const { getSourceProps, isDragging, showGrabbing } = useDragSource({
    id: rowId,
    onClickWithoutDrag: (event) => {
      openGripMenu(event as PointerEvent<HTMLButtonElement>);
    },
    onDragInteractionStart: () => {
      setOpenRowId(null);
      onDragInteractionStart?.();
    },
  });

  const resetPressMove = () => {
    pressOriginRef.current = null;
    setIsPointerMoving(false);
  };

  const isMoveCursor = isPointerMoving || showGrabbing || isDragging;

  return (
    <div
      className={cn(
        "canvas-block-gutter flex h-fit w-12 shrink-0 items-start justify-end gap-0 pr-0",
        alignClassName
      )}
    >
      <BlockActionsMenu rowId={rowId}>
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
                <BlockActionsMenuTrigger
                  render={
                    <Button
                      aria-expanded={menuOpen}
                      aria-haspopup="menu"
                      aria-label="Block actions"
                      aria-pressed={isSelected}
                      className={cn(
                        "cursor-pointer",
                        isMoveCursor &&
                          (isDragging ? "cursor-grabbing" : "cursor-grab")
                      )}
                      data-canvas-row-select
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                      {...getSourceProps({
                        onClick: (event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        },
                        onPointerDown: (event) => {
                          if (event.button === 0) {
                            pressOriginRef.current = {
                              x: event.clientX,
                              y: event.clientY,
                            };
                            setIsPointerMoving(false);
                          }
                        },
                        onPointerMove: (event) => {
                          const origin = pressOriginRef.current;
                          if (!origin) {
                            return;
                          }
                          const dx = event.clientX - origin.x;
                          const dy = event.clientY - origin.y;
                          if (
                            Math.hypot(dx, dy) >=
                            POINTER_CLICK_DRAG_THRESHOLD_PX
                          ) {
                            setIsPointerMoving(true);
                          }
                        },
                        onPointerUp: (event) => {
                          event.stopPropagation();
                          if (event.button === 0) {
                            resetPressMove();
                          }
                        },
                        onPointerCancel: resetPressMove,
                        onDragEnd: resetPressMove,
                      })}
                    >
                      <IconGripVertical />
                    </Button>
                  }
                />
              }
            />
            <TooltipContent
              className="flex-col items-start gap-1 py-2"
              side="top"
            >
              <span className="inline-flex items-center gap-1">
                <Kbd>Click</Kbd>
                to select
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Drag</Kbd>
                to move
              </span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <BlockActionsMenuContent>
          <BlockGutterMenu
            canTurnInto={canTurnInto}
            onConvert={onConvert}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            rowId={rowId}
            turnIntoValue={turnIntoValue}
            viewOptions={viewOptions}
          />
        </BlockActionsMenuContent>
      </BlockActionsMenu>
    </div>
  );
}
