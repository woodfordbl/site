import { useCallback, useRef } from "react";

import { usePageSidebarChrome } from "@/components/pages/page-sidebar-chrome.tsx";
import { Shortcut } from "@/components/ui/shortcut.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { POINTER_CLICK_DRAG_THRESHOLD_PX } from "@/hooks/use-pointer-click-vs-drag.ts";
import {
  readRootFontSizePx,
  sidebarCollapseOvershootThresholdPx,
} from "@/lib/pages/page-sidebar-layout-cookie.ts";
import { cn } from "@/lib/utils.ts";

/** Wait before showing rail hints so quick passes do not flash tooltips. */
const RAIL_TOOLTIP_DELAY_MS = 300;

interface PageSidebarRailProps {
  className?: string;
}

/**
 * Sidebar boundary rail. When pinned, click collapses and press-and-drag resizes
 * the sidebar (12–24rem). In the collapsed hover panel, click pins it open.
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
  const maxOvershootPxRef = useRef(0);

  const resetPointerState = useCallback(() => {
    pointerOriginRef.current = null;
    didDragRef.current = false;
    maxOvershootPxRef.current = 0;
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
      const { overshootPx } = resizeSidebarToPointerX(event.clientX);
      maxOvershootPxRef.current = Math.max(
        maxOvershootPxRef.current,
        overshootPx
      );
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
        const collapseThresholdPx = sidebarCollapseOvershootThresholdPx(
          readRootFontSizePx()
        );
        if (maxOvershootPxRef.current >= collapseThresholdPx) {
          collapseSidebar();
        } else {
          commitSidebarWidth();
        }
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
        const collapseThresholdPx = sidebarCollapseOvershootThresholdPx(
          readRootFontSizePx()
        );
        if (maxOvershootPxRef.current >= collapseThresholdPx) {
          collapseSidebar();
        } else {
          commitSidebarWidth();
        }
      }

      resetPointerState();
    },
    [collapseSidebar, commitSidebarWidth, resetPointerState]
  );

  return (
    <TooltipProvider delay={RAIL_TOOLTIP_DELAY_MS}>
      <Tooltip trackCursorAxis="y">
        <TooltipTrigger
          render={
            <button
              aria-label={
                isCollapsed ? "Pin sidebar open" : "Resize or collapse sidebar"
              }
              className={cn(
                "absolute inset-inline-start-0 inset-y-0 z-30 hidden w-3 -translate-x-1/2 cursor-col-resize border-0 bg-transparent p-0 outline-none after:absolute after:inset-y-2 after:left-1/2 after:w-0.5 after:transition-colors hover:after:bg-selection-primary focus-visible:outline-none focus-visible:ring-0 sm:flex",
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
          className="flex-col items-start gap-0.5 px-2 py-1"
          showArrow={false}
          side="right"
          sideOffset={8}
        >
          {isCollapsed ? null : (
            <span className="inline-flex items-center gap-1">
              <span className="font-medium">Drag</span>
              to resize
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="font-medium">Click</span>
            {isCollapsed ? "to pin open" : "to collapse"}
            <Shortcut command="toggle-sidebar" />
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
