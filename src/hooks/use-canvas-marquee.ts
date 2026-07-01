import { type RefObject, useEffect, useRef, useState } from "react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { useDragState } from "@/components/dnd/use-dnd.ts";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { POINTER_CLICK_DRAG_THRESHOLD_PX } from "@/hooks/use-pointer-click-vs-drag.ts";
import {
  type MarqueePoint,
  type MarqueeRect,
  marqueeRectFromPoints,
  rowIdsIntersectingMarquee,
} from "@/lib/canvas/marquee-selection.ts";
import { collectCanvasRowRects } from "@/lib/canvas/resolve-drop-target.ts";

/**
 * Mousedown targets that must never start a marquee: interactive controls,
 * block content (text selection wins there), and gutter menu/handle surfaces.
 */
const MARQUEE_IGNORE_SELECTOR =
  "input, textarea, button, a, select, [contenteditable], [role='button'], [data-canvas-row-content], [data-canvas-row-select], [data-canvas-row-menu]";

/** Edge band of the scroll root that auto-scrolls while the marquee is held there. */
const AUTOSCROLL_EDGE_PX = 72;
const AUTOSCROLL_MAX_STEP_PX = 16;

interface MarqueeSession {
  active: boolean;
  lastClientX: number;
  lastClientY: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

function autoScrollStep(clientY: number, rootRect: DOMRect): number {
  const topZone = rootRect.top + AUTOSCROLL_EDGE_PX;
  const bottomZone = rootRect.bottom - AUTOSCROLL_EDGE_PX;
  if (clientY < topZone) {
    const ratio = Math.min(1, (topZone - clientY) / AUTOSCROLL_EDGE_PX);
    return -Math.ceil(ratio * AUTOSCROLL_MAX_STEP_PX);
  }
  if (clientY > bottomZone) {
    const ratio = Math.min(1, (clientY - bottomZone) / AUTOSCROLL_EDGE_PX);
    return Math.ceil(ratio * AUTOSCROLL_MAX_STEP_PX);
  }
  return 0;
}

/** Swallow the click that follows a completed marquee drag (same task as mouseup). */
function suppressNextClick(): void {
  const suppress = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", suppress, true);
  setTimeout(() => {
    window.removeEventListener("click", suppress, true);
  }, 0);
}

function blurActiveField(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

/**
 * Fine-pointer marquee selection: mousedown on empty canvas space, drag past
 * the click threshold to draw a selection rectangle that live-selects every
 * top-level block it touches. Returns the viewport-space rect to render as the
 * overlay, or null while idle.
 *
 * Coexists with the capture-phase overclick handler (which claims empty-space
 * mousedowns to focus the nearest row): this listener is on `document` capture
 * so it sees the event first, but only records a candidate — a plain click
 * still resolves to overclick focus, and only crossing the drag threshold
 * activates the marquee (blurring the overclick focus).
 */
export function useCanvasMarquee(
  scrollRootRef: RefObject<HTMLElement | null>
): MarqueeRect | null {
  const { clearFocus, clearSelection, getRows, selectRows } =
    useCanvasEditorContext();
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const isDragging = useDragState((state) => state.draggingId != null);
  const isDraggingRef = useRef(isDragging);
  isDraggingRef.current = isDragging;

  const [rect, setRect] = useState<MarqueeRect | null>(null);

  useEffect(() => {
    if (isCoarsePrimaryPointer) {
      return;
    }
    const root = scrollRootRef.current;
    if (!root) {
      return;
    }

    let session: MarqueeSession | null = null;
    let frame = 0;

    /** Marquee origin in current viewport coords (start point compensated for scroll). */
    const startViewportPoint = (current: MarqueeSession): MarqueePoint => ({
      x: current.startClientX - (root.scrollLeft - current.startScrollLeft),
      y: current.startClientY - (root.scrollTop - current.startScrollTop),
    });

    const updateMarquee = (current: MarqueeSession) => {
      const marquee = marqueeRectFromPoints(startViewportPoint(current), {
        x: current.lastClientX,
        y: current.lastClientY,
      });
      setRect(marquee);
      selectRows(
        rowIdsIntersectingMarquee(getRows(), marquee, collectCanvasRowRects())
      );
    };

    const autoScrollTick = () => {
      const current = session;
      if (!current?.active) {
        return;
      }
      const step = autoScrollStep(
        current.lastClientY,
        root.getBoundingClientRect()
      );
      if (step !== 0) {
        const before = root.scrollTop;
        root.scrollTop += step;
        if (root.scrollTop !== before) {
          updateMarquee(current);
        }
      }
      frame = requestAnimationFrame(autoScrollTick);
    };

    // Hoisted declarations: endSession and the window listeners reference each
    // other (teardown removes the listeners, the listeners trigger teardown).
    function endSession() {
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", handleWindowBlur);
      if (session?.active) {
        document.body.style.userSelect = "";
      }
      session = null;
      setRect(null);
    }

    const activate = (current: MarqueeSession) => {
      current.active = true;
      blurActiveField();
      clearFocus();
      window.getSelection()?.removeAllRanges();
      document.body.style.userSelect = "none";
      frame = requestAnimationFrame(autoScrollTick);
    };

    function handleMouseMove(event: MouseEvent) {
      const current = session;
      if (!current) {
        return;
      }
      current.lastClientX = event.clientX;
      current.lastClientY = event.clientY;

      if (!current.active) {
        const origin = startViewportPoint(current);
        const distance = Math.hypot(
          event.clientX - origin.x,
          event.clientY - origin.y
        );
        if (distance <= POINTER_CLICK_DRAG_THRESHOLD_PX) {
          return;
        }
        activate(current);
      }

      updateMarquee(current);
    }

    function handleMouseUp() {
      if (session?.active) {
        suppressNextClick();
      }
      endSession();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !session) {
        return;
      }
      const wasActive = session.active;
      endSession();
      if (wasActive) {
        event.stopPropagation();
        clearSelection();
      }
    }

    function handleWindowBlur() {
      endSession();
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || session || isDraggingRef.current) {
        return;
      }
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element && root.contains(target))) {
        return;
      }
      if (target.closest(MARQUEE_IGNORE_SELECTOR)) {
        return;
      }

      // Ignore mousedowns on the scroll root's own scrollbar.
      const rootRect = root.getBoundingClientRect();
      if (event.clientX >= rootRect.left + root.clientWidth) {
        return;
      }

      session = {
        active: false,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: root.scrollLeft,
        startScrollTop: root.scrollTop,
      };
      window.addEventListener("mousemove", handleMouseMove, true);
      window.addEventListener("mouseup", handleMouseUp, true);
      window.addEventListener("keydown", handleKeyDown, true);
      window.addEventListener("blur", handleWindowBlur);
    };

    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      endSession();
    };
  }, [
    clearFocus,
    clearSelection,
    getRows,
    isCoarsePrimaryPointer,
    scrollRootRef,
    selectRows,
  ]);

  return rect;
}
