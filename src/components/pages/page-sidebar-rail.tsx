import { useCallback, useRef } from "react";

import { usePageSidebarChrome } from "@/components/pages/page-sidebar-chrome.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { POINTER_CLICK_DRAG_THRESHOLD_PX } from "@/hooks/use-pointer-click-vs-drag.ts";
import { cn } from "@/lib/utils.ts";

/** Wait before showing rail hints so quick passes do not flash tooltips. */
const RAIL_TOOLTIP_DELAY_MS = 300;

interface PageSidebarRailProps {
  className?: string;
}

/**
 * Content-panel left-edge rail: click collapses; press-and-drag resizes the sidebar (12–24rem).
 * Spans the bordered main panel only — aligned to its left border.
 */
export function PageSidebarRail({ className }: PageSidebarRailProps) {
  const {
    collapseSidebar,
    commitSidebarWidth,
    isCollapsed,
    pinSidebar,
    resizeSidebarToPointerX,
  } = usePageSidebarChrome();
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);

  const resetPointerState = useCallback(() => {
    pointerOriginRef.current = null;
    didDragRef.current = false;
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      pointerOriginRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
      didDragRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const origin = pointerOriginRef.current;
      if (!origin) {
        return;
      }

      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (Math.hypot(dx, dy) <= POINTER_CLICK_DRAG_THRESHOLD_PX) {
        return;
      }

      if (isCollapsed) {
        return;
      }

      didDragRef.current = true;
      resizeSidebarToPointerX(event.clientX);
    },
    [isCollapsed, resizeSidebarToPointerX]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (didDragRef.current) {
        commitSidebarWidth();
        resetPointerState();
        return;
      }

      const origin = pointerOriginRef.current;
      resetPointerState();
      if (!origin) {
        return;
      }

      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (Math.hypot(dx, dy) <= POINTER_CLICK_DRAG_THRESHOLD_PX) {
        if (isCollapsed) {
          pinSidebar();
        } else {
          collapseSidebar();
        }
      }
    },
    [
      collapseSidebar,
      commitSidebarWidth,
      isCollapsed,
      pinSidebar,
      resetPointerState,
    ]
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (didDragRef.current) {
        commitSidebarWidth();
      }

      resetPointerState();
    },
    [commitSidebarWidth, resetPointerState]
  );

  return (
    <TooltipProvider delay={RAIL_TOOLTIP_DELAY_MS}>
      <Tooltip trackCursorAxis="y">
        <TooltipTrigger
          render={
            <button
              aria-label="Resize or collapse sidebar"
              className={cn(
                "absolute inset-inline-start-0 inset-y-0 z-30 hidden w-4 -translate-x-1/2 cursor-col-resize border-0 bg-transparent p-0 outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:-translate-x-1/2 hover:after:bg-sidebar-border focus-visible:outline-none focus-visible:ring-0 sm:flex",
                className
              )}
              data-page-sidebar-rail=""
              onPointerCancel={handlePointerCancel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              tabIndex={-1}
              type="button"
            />
          }
        />
        <TooltipContent
          className="flex-col items-start gap-1 py-2"
          showArrow={false}
          side="right"
          sideOffset={8}
        >
          <span className="inline-flex items-center gap-1">
            Close
            <Kbd>Click or</Kbd>
            <Kbd>⌘</Kbd>
            <Kbd>B</Kbd>
          </span>
          <span className="inline-flex items-center gap-1">
            Resize
            <Kbd>Drag</Kbd>
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
