import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { SIDEBAR_WIDTH_MOBILE, useSidebar } from "@/components/ui/sidebar.tsx";
import { useHaptics } from "@/hooks/haptics.ts";
import { POINTER_CLICK_DRAG_THRESHOLD_PX } from "@/hooks/use-pointer-click-vs-drag.ts";
import { cn } from "@/lib/utils.ts";

/** Past this many px/ms a flick wins over distance when deciding open vs closed. */
const VELOCITY_SNAP_PX_PER_MS = 0.5;
/** Fallback sidebar width (18rem at a 16px root) before the layer is measured. */
const SIDEBAR_WIDTH_FALLBACK_PX = 288;
/** White wash opacity over the content at full open; scales with swipe progress. */
const OVERLAY_MAX_OPACITY = 0.6;

type Axis = "undecided" | "horizontal" | "vertical";

interface PageSidebarSwipeRevealProps {
  children: ReactNode;
  sidebar: ReactNode;
}

/**
 * Mobile inset sidebar revealed by an iOS-style swipe: the content panel slides
 * right under the finger to expose a sidebar fixed behind it (mirroring the
 * desktop inset look — rounded content with a left gap when open), instead of a
 * full-bleed overlay sheet.
 *
 * Shares `openMobile` from {@link useSidebar} so the hamburger trigger and the
 * left-edge swipe drive the same state. Gesture mechanics copy the
 * pointer-capture idiom from `page-sidebar-rail.tsx`; the transform/transition
 * idiom copies `page-sidebar-hover-reveal.tsx`. Haptics tick once per snap-line
 * crossing via {@link useHaptics} (already a no-op off coarse pointers).
 */
export function PageSidebarSwipeReveal({
  children,
  sidebar,
}: PageSidebarSwipeRevealProps) {
  const { openMobile, setOpenMobile } = useSidebar();
  const haptic = useHaptics();

  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH_FALLBACK_PX);
  // null = not dragging (CSS transition owns the transform); a number = live drag.
  const [dragOffset, setDragOffset] = useState<number | null>(null);

  // Gesture bookkeeping (refs so pointer handlers stay referentially stable).
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const lastRef = useRef<{ x: number; t: number } | null>(null);
  const axisRef = useRef<Axis>("undecided");
  const didDragRef = useRef(false);
  const crossedRef = useRef(false);
  const captureElRef = useRef<HTMLElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Measure the real sidebar width so the drag tracks the finger 1:1.
  useEffect(() => {
    const node = sidebarRef.current;
    if (!node) {
      return;
    }
    const update = () => setSidebarWidth(node.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Escape closes (replacing what the dropped Sheet/Dialog gave for free).
  useEffect(() => {
    if (!openMobile) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMobile(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openMobile, setOpenMobile]);

  // Focus into the sidebar on open; restore to the prior element (the trigger)
  // on close.
  useEffect(() => {
    if (openMobile) {
      prevFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      sidebarRef.current?.focus({ preventScroll: true });
    } else if (prevFocusRef.current) {
      prevFocusRef.current.focus?.();
      prevFocusRef.current = null;
    }
  }, [openMobile]);

  const releaseCapture = useCallback((pointerId: number) => {
    if (captureElRef.current?.hasPointerCapture(pointerId)) {
      captureElRef.current.releasePointerCapture(pointerId);
    }
  }, []);

  const endGesture = useCallback(() => {
    originRef.current = null;
    lastRef.current = null;
    axisRef.current = "undecided";
    captureElRef.current = null;
  }, []);

  // Resolve the gesture axis once movement clears the click/drag threshold.
  const lockAxis = useCallback((dx: number, dy: number): Axis => {
    if (Math.hypot(dx, dy) <= POINTER_CLICK_DRAG_THRESHOLD_PX) {
      return "undecided";
    }
    const axis: Axis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    axisRef.current = axis;
    if (axis === "horizontal") {
      didDragRef.current = true;
    }
    return axis;
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!event.isPrimary) {
        return;
      }
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      originRef.current = { x: event.clientX, y: event.clientY };
      lastRef.current = { x: event.clientX, t: event.timeStamp };
      axisRef.current = "undecided";
      didDragRef.current = false;
      // If already open the gesture starts "past" the snap line.
      crossedRef.current = openMobile;
      captureElRef.current = event.currentTarget;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture can fail if the pointer is already gone; the gesture still
        // works without it, and releaseCapture guards on hasPointerCapture.
      }
    },
    [openMobile]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (!origin) {
        return;
      }

      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;

      if (axisRef.current === "undecided") {
        const axis = lockAxis(dx, dy);
        if (axis === "undecided") {
          return;
        }
        if (axis === "vertical") {
          // Hand the gesture back to the browser so the page scrolls.
          releaseCapture(event.pointerId);
          endGesture();
          return;
        }
      }

      if (axisRef.current !== "horizontal") {
        return;
      }

      const base = openMobile ? sidebarWidth : 0;
      const offset = Math.min(Math.max(base + dx, 0), sidebarWidth);
      setDragOffset(offset);

      const crossed = offset >= sidebarWidth / 2;
      if (crossed !== crossedRef.current) {
        crossedRef.current = crossed;
        haptic("selection");
      }

      lastRef.current = { x: event.clientX, t: event.timeStamp };
    },
    [endGesture, haptic, lockAxis, openMobile, releaseCapture, sidebarWidth]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      releaseCapture(event.pointerId);

      if (!origin) {
        endGesture();
        return;
      }

      const last = lastRef.current;
      const didDrag = didDragRef.current;
      const liveOffset = dragOffset;
      endGesture();

      if (!didDrag) {
        // A tap: on the open backdrop it closes; on the closed edge strip it
        // does nothing (only a swipe opens).
        setDragOffset(null);
        if (openMobile) {
          setOpenMobile(false);
        }
        return;
      }

      const offset = liveOffset ?? (openMobile ? sidebarWidth : 0);
      let velocity = 0;
      if (last) {
        const dt = Math.max(1, event.timeStamp - last.t);
        velocity = (event.clientX - last.x) / dt;
      }

      let shouldOpen: boolean;
      if (velocity > VELOCITY_SNAP_PX_PER_MS) {
        shouldOpen = true;
      } else if (velocity < -VELOCITY_SNAP_PX_PER_MS) {
        shouldOpen = false;
      } else {
        shouldOpen = offset >= sidebarWidth / 2;
      }

      // Release capture (above) before flipping state so the CSS transition runs.
      setDragOffset(null);
      setOpenMobile(shouldOpen);
    },
    [
      dragOffset,
      endGesture,
      openMobile,
      releaseCapture,
      setOpenMobile,
      sidebarWidth,
    ]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      releaseCapture(event.pointerId);
      endGesture();
      setDragOffset(null);
    },
    [endGesture, releaseCapture]
  );

  const gestureHandlers = {
    onPointerCancel: handlePointerCancel,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
  };

  const translateX = dragOffset ?? (openMobile ? sidebarWidth : 0);
  const isDragging = dragOffset !== null;
  const isRevealed = translateX > 0;
  const overlayProgress = Math.min(translateX / sidebarWidth, 1);

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden bg-sidebar">
      {/* Sidebar layer — fixed behind the content, revealed as content slides. */}
      <div
        aria-hidden={!openMobile}
        aria-label="Sidebar"
        aria-modal={openMobile}
        className="absolute inset-y-0 left-0 z-0 flex flex-col bg-sidebar text-sidebar-foreground outline-none"
        inert={!openMobile}
        ref={sidebarRef}
        role="dialog"
        style={{ width: SIDEBAR_WIDTH_MOBILE }}
        tabIndex={-1}
      >
        {sidebar}
      </div>

      {/* Content layer — slides right to reveal the sidebar; rounded inset when open. */}
      <div
        className={cn(
          "relative z-10 h-full w-full bg-background transition-transform duration-200 ease-[var(--ease-drawer)] will-change-transform motion-reduce:transition-none",
          isDragging && "transition-none",
          isRevealed &&
            "overflow-hidden rounded-3xl shadow-lg ring-1 ring-border"
        )}
        style={{ transform: `translateX(${translateX}px)` }}
      >
        <div className="h-full w-full" inert={openMobile}>
          {children}
        </div>

        {/* White wash over the content; opacity tracks swipe progress. */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 z-10 bg-white transition-opacity duration-200 ease-[var(--ease-drawer)] motion-reduce:transition-none",
            isDragging && "transition-none",
            openMobile ? "pointer-events-auto" : "pointer-events-none"
          )}
          style={{
            opacity: overlayProgress * OVERLAY_MAX_OPACITY,
            touchAction: "none",
          }}
          {...(openMobile ? gestureHandlers : {})}
        />
      </div>

      {/* Left-edge hit strip — captures the opening swipe while closed. */}
      {openMobile ? null : (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 z-20 w-3"
          // touch-action: none claims the left-edge horizontal swipe so iOS
          // Safari's back-navigation gesture doesn't fire from this strip
          // (Android/Chrome is already covered by `overscroll-behavior: none`).
          style={{ touchAction: "none" }}
          {...gestureHandlers}
        />
      )}
    </div>
  );
}
