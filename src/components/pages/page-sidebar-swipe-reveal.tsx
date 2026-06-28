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

  // Suppress iOS Safari's left-edge "swipe back" so it doesn't fire instead of
  // (or alongside) our open gesture. touch-action alone doesn't stop Safari's
  // system gesture; non-passive touchstart/touchmove preventDefault on the edge
  // strip does. Callback ref so the listeners attach/detach exactly when the
  // strip (rendered only while closed) mounts/unmounts.
  const edgeStripRef = useCallback((strip: HTMLDivElement | null) => {
    if (!strip) {
      return;
    }
    const prevent = (event: TouchEvent) => {
      event.preventDefault();
    };
    strip.addEventListener("touchstart", prevent, { passive: false });
    strip.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      strip.removeEventListener("touchstart", prevent);
      strip.removeEventListener("touchmove", prevent);
    };
  }, []);

  // Haptic tick whenever the sidebar commits to open or closed. Gesture commits
  // fire the haptic *synchronously* inside the pointer handler (iOS Safari's
  // web-haptics switch trick needs to run within the user-gesture context) and
  // set skipCommitHapticRef so this effect doesn't double-fire. The effect still
  // covers non-gesture commits: hamburger, Escape, programmatic. Seeded with the
  // current state to skip the initial mount.
  const prevOpenRef = useRef(openMobile);
  const skipCommitHapticRef = useRef(false);
  useEffect(() => {
    if (prevOpenRef.current === openMobile) {
      return;
    }
    prevOpenRef.current = openMobile;
    if (skipCommitHapticRef.current) {
      skipCommitHapticRef.current = false;
      return;
    }
    haptic("selection");
  }, [openMobile, haptic]);

  // Commit open/closed from a gesture: fire the haptic synchronously (within the
  // gesture) when the state actually changes, then flag the effect to skip it.
  const commitOpenFromGesture = useCallback(
    (next: boolean) => {
      if (next !== openMobile) {
        haptic("selection");
        skipCommitHapticRef.current = true;
      }
      setDragOffset(null);
      setOpenMobile(next);
    },
    [haptic, openMobile, setOpenMobile]
  );

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
      captureElRef.current = event.currentTarget;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture can fail if the pointer is already gone; the gesture still
        // works without it, and releaseCapture guards on hasPointerCapture.
      }
    },
    []
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

      lastRef.current = { x: event.clientX, t: event.timeStamp };
    },
    [endGesture, lockAxis, openMobile, releaseCapture, sidebarWidth]
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
        if (openMobile) {
          commitOpenFromGesture(false);
        } else {
          setDragOffset(null);
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
      commitOpenFromGesture(shouldOpen);
    },
    [
      commitOpenFromGesture,
      dragOffset,
      endGesture,
      openMobile,
      releaseCapture,
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
  // Front-load the sidebar-color fade (ease-out quadratic) so the bars/safe
  // areas read as sidebar-gray early in the swipe rather than only near the end.
  const revealProgress = overlayProgress * (2 - overlayProgress);

  // Drive the page background (the surface iOS Safari samples for its top/bottom
  // bar tint) toward the sidebar color as the sidebar is revealed, so the bars
  // fade to sidebar-gray with the swipe instead of being permanently gray. The
  // dragging flag drops the CSS transition so the tint tracks the finger 1:1.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sidebar-reveal", String(revealProgress));
    root.toggleAttribute("data-swipe-dragging", isDragging);
    return () => {
      root.style.removeProperty("--sidebar-reveal");
      root.removeAttribute("data-swipe-dragging");
    };
  }, [revealProgress, isDragging]);

  // While the sidebar is open the document (the mobile scroller) must not scroll
  // behind it — keeps the fixed sidebar / safe-area layers aligned and matches a
  // native drawer. This component only renders on narrow viewports, so locking
  // the document scroller (`<html>`) is mobile-only; on desktop the shell is
  // already `overflow-hidden`, making this a no-op.
  useEffect(() => {
    if (!openMobile) {
      return;
    }
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prevOverflow;
    };
  }, [openMobile]);

  return (
    <div className="relative w-full bg-sidebar max-md:overflow-x-clip md:min-h-0 md:flex-1 md:overflow-hidden">
      {/* Sidebar layer — fixed behind the content, revealed as content slides.
          On mobile the document is the scroller, so this is `fixed` (pinned to
          the viewport) rather than `absolute` against a now document-tall
          container, which would scroll away with the body. */}
      <div
        aria-hidden={!openMobile}
        aria-label="Sidebar"
        aria-modal={openMobile}
        className="z-0 flex flex-col bg-sidebar text-sidebar-foreground outline-none max-md:fixed max-md:inset-y-0 max-md:left-0 md:absolute md:inset-y-0 md:left-0"
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
          // Mobile: natural height (`min-h-svh`) so the document — not this
          // layer — owns the scroll; desktop keeps `h-full` inside the fixed shell.
          "relative z-10 w-full bg-background transition-transform duration-200 ease-[var(--ease-drawer)] will-change-transform motion-reduce:transition-none max-md:min-h-svh md:h-full",
          isDragging && "transition-none",
          // Keep the rounded inset + ring when revealed, but never clamp the
          // vertical document scroll on mobile (`overflow-x-clip`, not hidden).
          isRevealed &&
            "rounded-3xl ring-1 ring-border max-md:overflow-x-clip md:overflow-hidden"
        )}
        style={{ transform: `translateX(${translateX}px)` }}
      >
        <div className="w-full max-md:min-h-svh md:h-full" inert={openMobile}>
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

      {/* Fill the top/bottom safe areas as the sidebar is revealed so the
          content's translate (and the white wash over it) doesn't leave the
          insets showing a split/wrong surface. Heights are the safe-area insets
          — non-zero only with notch / home indicator (and the top grows when
          Safari's address bar collapses on scroll); opacity tracks the swipe so
          they switch in with the gesture.

          The top inset is filled with bg-background to match the page header
          that lives directly beneath it: the header's safe-area padding is
          bg-background, so the inset must stay bg-background through the swipe
          rather than fading to sidebar-gray. The bottom (home indicator) keeps
          the sidebar tint since no header anchors it. */}
      <div
        aria-hidden
        className={cn(
          // Pinned to the viewport top on mobile (the document scrolls beneath),
          // not the document top. Sibling of the transformed content layer, so
          // `fixed` resolves to the viewport.
          "pointer-events-none z-30 bg-background transition-opacity duration-200 ease-[var(--ease-drawer)] motion-reduce:transition-none max-md:fixed max-md:inset-x-0 max-md:top-0 md:absolute md:inset-x-0 md:top-0",
          isDragging && "transition-none"
        )}
        style={{
          height: "env(safe-area-inset-top)",
          opacity: revealProgress,
        }}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none z-30 bg-sidebar transition-opacity duration-200 ease-[var(--ease-drawer)] motion-reduce:transition-none max-md:fixed max-md:inset-x-0 max-md:bottom-0 md:absolute md:inset-x-0 md:bottom-0",
          isDragging && "transition-none"
        )}
        style={{
          height: "env(safe-area-inset-bottom)",
          opacity: revealProgress,
        }}
      />

      {/* Left-edge hit strip — captures the opening swipe while closed. */}
      {openMobile ? null : (
        <div
          aria-hidden
          // `fixed` on mobile so the opening edge-swipe zone stays pinned to the
          // viewport's left edge at any document scroll position.
          className="z-20 w-5 max-md:fixed max-md:inset-y-0 max-md:left-0 md:absolute md:inset-y-0 md:left-0"
          // touch-action: none + the non-passive preventDefault effect above
          // claim the left-edge horizontal swipe so iOS Safari's back-navigation
          // gesture doesn't fire from this strip. ~20px wide to cover Safari's
          // edge zone. (Android/Chrome is covered by `overscroll-behavior: none`.)
          ref={edgeStripRef}
          style={{ touchAction: "none" }}
          {...gestureHandlers}
        />
      )}
    </div>
  );
}
