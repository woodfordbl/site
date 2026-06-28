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

/** Lazily-made 1x1 canvas used to resolve CSS color tokens (oklch) to rgb. */
let colorResolverCtx: CanvasRenderingContext2D | null = null;
function resolveCssColorToRgb(value: string): [number, number, number] | null {
  if (typeof document === "undefined") {
    return null;
  }
  if (!colorResolverCtx) {
    colorResolverCtx = document.createElement("canvas").getContext("2d");
  }
  const ctx = colorResolverCtx;
  if (!ctx) {
    return null;
  }
  // A no-op assignment first so an unparseable value can't silently reuse a
  // prior color; then read the rasterized pixel (the canvas normalizes oklch).
  ctx.fillStyle = "#000";
  ctx.fillStyle = value.trim();
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

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

  // The content layer is the *document-tall* scroller, so its `border-radius`
  // corners sit at the document top/bottom — off-screen unless scrolled to an
  // edge. Clip it to the visible viewport band instead, with rounded corners, so
  // the inset "card" reads at the viewport edges at any scroll position. Vertical
  // scroll is frozen for the duration of the reveal (the gesture locks to the
  // horizontal axis, and an open sidebar locks the document), so reading
  // `scrollY` once per render is stable. `100%` is the element's own height, so
  // we don't have to measure it; `max(0px, …)` guards short pages.
  let revealClipPath: string | undefined;
  let revealFrameHeight: number | undefined;
  if (isRevealed && typeof window !== "undefined") {
    const top = window.scrollY;
    revealFrameHeight = window.innerHeight;
    // `var(--radius-3xl)` keeps the clip radius identical to the ring frame's
    // `rounded-3xl` (the two must match, or the corners read doubled).
    revealClipPath = `inset(${top}px 0px max(0px, calc(100% - ${top + revealFrameHeight}px)) 0px round var(--radius-3xl))`;
  }

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

    // Keep the iOS Safari top-bar tint (`<meta name="theme-color">`) in lockstep
    // with the body bar-tint surface: bg-background at rest, fading to bg-sidebar
    // with the swipe. Without this the static meta would pin the status/address
    // bar to one color while the rest of the chrome fades — the mismatch the user
    // sees as a permanently-gray top bar. Mirrors the body `color-mix` in styles.css.
    const meta = document.querySelector('meta[name="theme-color"]');
    const styles = getComputedStyle(root);
    const background = resolveCssColorToRgb(
      styles.getPropertyValue("--background")
    );
    const sidebar = resolveCssColorToRgb(styles.getPropertyValue("--sidebar"));
    if (meta && background && sidebar) {
      const mix = background.map((channel, i) =>
        Math.round(channel + (sidebar[i] - channel) * revealProgress)
      );
      meta.setAttribute("content", `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`);
    }

    return () => {
      root.style.removeProperty("--sidebar-reveal");
      root.removeAttribute("data-swipe-dragging");
      // Restore the rest tint (bg-background) when the swipe surface unmounts.
      if (meta && background) {
        meta.setAttribute(
          "content",
          `rgb(${background[0]}, ${background[1]}, ${background[2]})`
        );
      }
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
    <div className="relative w-full bg-background max-md:overflow-x-clip md:min-h-0 md:flex-1 md:overflow-hidden">
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
          // `revealClipPath` rounds the inset card at the viewport edges; never
          // clamp the vertical document scroll on mobile (`overflow-x-clip`, not
          // hidden).
          isRevealed && "max-md:overflow-x-clip md:overflow-hidden"
        )}
        style={{
          transform: `translateX(${translateX}px)`,
          clipPath: revealClipPath,
        }}
      >
        <div className="w-full max-md:min-h-svh md:h-full" inert={openMobile}>
          {children}
        </div>

        {/* Scrim over the content; opacity tracks swipe progress. White in light
            mode (content recedes by washing out); near-black in dark mode (a
            white wash there reads as a jarring brighten — dark dims instead). */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 z-10 bg-white transition-opacity duration-200 ease-[var(--ease-drawer)] motion-reduce:transition-none dark:bg-black",
            isDragging && "transition-none",
            openMobile ? "pointer-events-auto" : "pointer-events-none"
          )}
          style={{
            opacity: overlayProgress * OVERLAY_MAX_OPACITY,
            touchAction: "none",
          }}
          {...(openMobile ? gestureHandlers : {})}
        />

        {/* Border outline for the inset card. The content layer's own `ring`
            would draw at the document-tall box edges (off-screen); a viewport-
            sticky frame keeps the ring at the visible card edges. The wrapper is
            `absolute` so it adds no flow height; the inner element is `sticky` so
            it pins to the viewport as the (frozen) scroll position dictates. Both
            are clipped to the same rounded band by `revealClipPath` above. */}
        {isRevealed ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20"
          >
            <div
              className="sticky top-0 rounded-3xl ring-1 ring-border ring-inset"
              style={{ height: revealFrameHeight }}
            />
          </div>
        ) : null}
      </div>

      {/* The top/bottom safe-area insets are tinted by the root `<html>`
          background (styles.css): bg-background at rest, fading to sidebar with
          the swipe. That covers the insets uniformly, so the old fixed fill bars
          here are redundant — and being full-width with square corners at z-30,
          they painted over the inset card's rounded corners during the reveal. */}

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
