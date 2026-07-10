import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useRef,
} from "react";

import { useBlockActionsMenu } from "@/components/canvas/block-actions-menu.tsx";
import {
  useCanvasEditorContext,
  useCanvasSelection,
} from "@/components/canvas/canvas-editor-context.tsx";
import { useDropTarget } from "@/components/dnd/use-dnd.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { useBlockTouchGesture } from "@/hooks/use-block-touch-gesture.ts";
import { useTimeout } from "@/hooks/use-timeout.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { DropTarget } from "@/lib/canvas/resolve-drop-target.ts";
import {
  pageCanvasGutterMobileClassName,
  pageCanvasGutterPullClassName,
} from "@/lib/pages/page-title-layout.ts";
import { cn } from "@/lib/utils.ts";

/** Wait before revealing gutter controls so quick row passes do not flash. */
const CANVAS_GUTTER_REVEAL_DELAY_MS = 100;

function setRowGutterRevealed(
  layout: HTMLDivElement | null,
  revealed: boolean
): void {
  if (!layout) {
    return;
  }
  if (revealed) {
    layout.dataset.gutterRevealed = "";
  } else {
    delete layout.dataset.gutterRevealed;
  }
}

/** True when `target` is inside a nested canvas row (list item, column child, etc.). */
function isNestedRowShellTarget(
  layout: HTMLDivElement,
  target: EventTarget | null
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const rowShell = layout.closest("[data-canvas-row-shell]");
  const hoveredShell = target.closest("[data-canvas-row-shell]");
  return (
    hoveredShell !== null &&
    rowShell !== null &&
    hoveredShell !== rowShell &&
    rowShell.contains(hoveredShell)
  );
}

interface CanvasRowShellProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Top-level block spacing on the content column (and gutter wrapper) when a gutter is shown. */
  contentSpacingClassName?: string;
  /**
   * Enable the mobile touch gesture (long-press opens the actions drawer,
   * hold-then-drag reorders) on this row's content. Set on coarse pointers in
   * edit mode, where the gutter is removed.
   */
  enableTouchGesture?: boolean;
  gutter?: ReactNode;
  /** Vertically centers gutter controls with short, non-text rows (e.g. divider). */
  gutterAlignCenter?: boolean;
  /**
   * Override the gutter's leftward pull (default {@link pageCanvasGutterPullClassName}).
   * Callout children use a smaller pull so their handles sit inset from the
   * callout's own margin handle instead of colliding with it.
   */
  gutterPullClassName?: string;
  /**
   * Keep this row's gutter revealed while hovering its nested children, instead
   * of handing the reveal off to the child shell. Used by the callout container
   * so the whole-box drag handle / actions menu stays accessible on overall
   * hover; children still reveal their own gutters independently.
   */
  keepGutterOnNestedHover?: boolean;
  row: CanvasRow;
}

export function CanvasRowShell({
  row,
  gutter,
  gutterAlignCenter = false,
  contentSpacingClassName,
  enableTouchGesture = false,
  keepGutterOnNestedHover = false,
  gutterPullClassName = pageCanvasGutterPullClassName,
  children,
  className,
  contentClassName,
}: CanvasRowShellProps) {
  const { toggleRowSelection } = useCanvasEditorContext();
  const { isRowSelected } = useCanvasSelection();
  const { setOpenRowId } = useBlockActionsMenu();
  const isSelected = isRowSelected(row.rowId);
  // Database and table blocks own their own chrome; a selection fill reads as
  // a block "ring" around the whole surface and fights the select gutter.
  const suppressSelectionFill =
    row.effectiveBlock.type === "database" ||
    row.effectiveBlock.type === "table";
  const isNarrowViewport = useIsNarrowViewport();
  const rowLayoutRef = useRef<HTMLDivElement>(null);
  const gutterOpenTimeout = useTimeout();
  const touchGesture = useBlockTouchGesture({
    rowId: row.rowId,
    onOpenDrawer: setOpenRowId,
  });

  const dropEdge = useDropTarget((target: DropTarget | null) => {
    if (target?.rowId !== row.rowId) {
      return null;
    }
    if (target.atScopeStart) {
      return "before" as const;
    }
    return target.edge;
  });

  const handleRowLayoutPointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (!gutter) {
      return;
    }

    const layout = rowLayoutRef.current;
    if (
      !layout ||
      (!keepGutterOnNestedHover && isNestedRowShellTarget(layout, event.target))
    ) {
      return;
    }

    gutterOpenTimeout.clear();
    gutterOpenTimeout.start(CANVAS_GUTTER_REVEAL_DELAY_MS, () => {
      setRowGutterRevealed(rowLayoutRef.current, true);
    });
  };

  const handleRowLayoutPointerLeave = () => {
    gutterOpenTimeout.clear();
    setRowGutterRevealed(rowLayoutRef.current, false);
  };

  const handleRowLayoutPointerOver = (event: PointerEvent<HTMLDivElement>) => {
    const layout = rowLayoutRef.current;
    if (!(layout && gutter) || keepGutterOnNestedHover) {
      return;
    }

    if (isNestedRowShellTarget(layout, event.target)) {
      gutterOpenTimeout.clear();
      setRowGutterRevealed(layout, false);
    }
  };

  const handleContentPointerDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.shiftKey) {
      return;
    }

    const layout = rowLayoutRef.current;
    if (layout && isNestedRowShellTarget(layout, event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    toggleRowSelection(row.rowId, { shiftKey: true });
  };
  const showBefore = dropEdge === "before";
  const showAfter = dropEdge === "after";

  let gutterHost: React.ReactNode = null;
  if (gutter) {
    gutterHost = (
      <div
        className={cn(
          "pointer-events-none z-10 w-auto [&_.canvas-block-gutter]:opacity-0",
          isNarrowViewport
            ? cn("absolute top-0", pageCanvasGutterMobileClassName)
            : cn("shrink-0", gutterPullClassName, "w-auto")
        )}
        data-canvas-row-gutter-host
      >
        <div
          className={cn("pointer-events-auto h-fit", contentSpacingClassName)}
        >
          {gutter}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-visible", className)}
      data-canvas-row-id={row.rowId}
      data-canvas-row-shell
    >
      {showBefore ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 -translate-y-1/2 bg-selection-primary"
        />
      ) : null}
      <div
        className={cn(
          "flex min-w-0",
          gutter && isNarrowViewport && "relative",
          gutterAlignCenter ? "items-center" : "items-start",
          gutter &&
            !keepGutterOnNestedHover &&
            "[&:has([data-canvas-row-content]_[data-canvas-row-shell]:hover)>_[data-canvas-row-gutter-host]_.canvas-block-gutter]:opacity-0!",
          gutter &&
            "[&[data-gutter-revealed]>[data-canvas-row-gutter-host]_.canvas-block-gutter]:opacity-100"
        )}
        data-canvas-row-layout
        onPointerEnter={handleRowLayoutPointerEnter}
        onPointerLeave={handleRowLayoutPointerLeave}
        onPointerOver={handleRowLayoutPointerOver}
        ref={rowLayoutRef}
      >
        {gutterHost}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 transition-colors",
            // Database/table surfaces own their chrome — no rounded selection
            // plate (reads as a ring around the whole block).
            !suppressSelectionFill && "rounded-lg",
            contentSpacingClassName,
            !suppressSelectionFill &&
              (isSelected || (enableTouchGesture && touchGesture.isPressing)) &&
              "bg-selection",
            enableTouchGesture && touchGesture.isDragging && "opacity-60",
            contentClassName
          )}
          data-canvas-row-content
          onPointerDownCapture={handleContentPointerDown}
          {...(enableTouchGesture ? touchGesture.props : null)}
        >
          {children}
        </div>
      </div>
      {showAfter ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1 translate-y-1/2 bg-selection-primary"
        />
      ) : null}
    </div>
  );
}
