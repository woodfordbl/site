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
 * idiom copies `page-sidebar-hover-reveal.tsx`. Haptics tick once via
 * {@link useHaptics} (a no-op off coarse pointers) as a swipe crosses the snap
 * line, and once when a backdrop tap closes; the hamburger trigger fires its
 * own tick in-gesture (see `toggleSidebar` in `sidebar.tsx`).
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
  // Whether to paint the fixed sidebar layer — true while revealing/open and
  // bridged through the close slide; false once fully closed (see effect below).
  const [isClosingReveal, setIsClosingReveal] = useState(false);
  const wasRevealedRef = useRef(false);

  // Gesture bookkeeping (refs so pointer handlers stay referentially stable).
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const lastRef = useRef<{ x: number; t: number } | null>(null);
  const axisRef = useRef<Axis>("undecided");
  const didDragRef = useRef(false);
  // The open/closed state the current gesture has last fired a haptic for, so a
  // drag ticks once each time it crosses the snap line (and a tap ticks once on
  // release) without ever double-firing. Reset at pointer-down to the live state.
  const hapticStateRef = useRef(openMobile);
  const captureElRef = useRef<HTMLElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  // The nav holds the actual sidebar width; the layer around it is a full-width
  // bg-sidebar backdrop, so we measure the nav (not the layer) for the slide.
  const navRef = useRef<HTMLDivElement>(null);

  // Measure the real nav width so the drag tracks the finger 1:1 and the content
  // slides exactly the sidebar's width.
  useEffect(() => {
    const node = navRef.current;
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

  // Fire one selection tick whenever the gesture's projected open/closed state
  // flips, tracked in `hapticStateRef` so it never double-fires.
  //
  // Crucially this is driven from `handlePointerMove` (the drag crossing the
  // snap line), NOT only from the release: iOS Safari's web-haptics switch
  // trick produces feedback during the *active* drag but not from the pointerup
  // that ends a captured-pointer drag — firing only on release is why the swipe
  // felt dead while the (no-drag) backdrop tap and hamburger worked. A tap still
  // ticks fine on release, and a velocity flick that lands on a state the drag
  // never crossed gets a best-effort tick at commit. See
  // docs/architecture/haptics.md.
  const tickHapticForState = useCallback(
    (projectedOpen: boolean) => {
      if (projectedOpen !== hapticStateRef.current) {
        hapticStateRef.current = projectedOpen;
        haptic("selection");
      }
    },
    [haptic]
  );

  // Commit open/closed from a gesture (swipe or backdrop tap).
  const commitOpenFromGesture = useCallback(
    (next: boolean) => {
      tickHapticForState(next);
      setDragOffset(null);
      setOpenMobile(next);
    },
    [setOpenMobile, tickHapticForState]
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
      hapticStateRef.current = openMobile;
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
      // Tick as the drag crosses the snap line — the point that decides whether
      // release will open or close. Firing here (mid-drag) is what makes the
      // swipe haptic land on iOS; see `tickHapticForState`.
      tickHapticForState(offset >= sidebarWidth / 2);

      lastRef.current = { x: event.clientX, t: event.timeStamp };
    },
    [
      endGesture,
      lockAxis,
      openMobile,
      releaseCapture,
      sidebarWidth,
      tickHapticForState,
    ]
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
  // `isRevealed` flips to false the instant a close commits (translateX → 0 in
  // state), while the transform keeps animating home for ~200ms. `revealActive`
  // stays true through that close slide (bridged by `isClosingReveal`, set in the
  // effect below) so the rounding, ring, and scrim animate out *with* the slide
  // instead of snapping off at frame 0.
  const revealActive = isRevealed || isClosingReveal;

  // The content layer is the document-tall page; plain `border-radius` would put
  // its corners at the document top/bottom (off-screen mid-scroll). So clip it to
  // the visible viewport band with rounded corners via `clip-path`. The content
  // layer stays in normal flow (so the document keeps its scroll height — going
  // `position: fixed` collapses it and resets scrollY). Scroll is frozen during
  // the reveal (the gesture locks to the horizontal axis; an open sidebar locks
  // the document), so `window.scrollY` is a stable constant.
  //
  // CRUCIAL: the dim scrim and the ring are rounded with `border-radius`, NOT
  // their own `clip-path`. iOS WebKit drops the corner radius of a `clip-path:
  // inset(round)` on an *opacity-composited* layer (older Safari) — that was the
  // square-corner artifact (the scrim's square corner punched through). The
  // content layer's own clip-path rounds the (non-composited) page content fine.
  let revealClipPath: string | undefined;
  let viewportHeight: number | undefined;
  if (revealActive && typeof window !== "undefined") {
    const top = window.scrollY;
    viewportHeight = window.innerHeight;
    revealClipPath = `inset(${top}px 0px max(0px, calc(100% - ${top + viewportHeight}px)) 0px round var(--radius-3xl))`;
  }

  const overlayProgress = Math.min(translateX / sidebarWidth, 1);
  // Front-load the sidebar-color fade (ease-out quadratic) so the bars/safe
  // areas read as sidebar-gray early in the swipe rather than only near the end.
  const revealProgress = overlayProgress * (2 - overlayProgress);

  // Drive the page background (the surface iOS Safari samples for the areas
  // *behind* its top/bottom bars, via the `<html>` color-mix in styles.css)
  // toward the sidebar color as the sidebar is revealed, so the insets fade to
  // sidebar-gray with the swipe instead of staying bg-background. The dragging
  // flag drops the CSS transition so the tint tracks the finger 1:1. (The top-bar
  // `theme-color` tint itself is owned by the `prefers-color-scheme` metas in
  // __root — iOS doesn't reliably honor a JS-updated `theme-color`.)
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

  // The sidebar layer is `position: fixed` and full viewport height. When fully
  // closed it would stay painted behind the content — and on iOS, after a scroll,
  // its bg-sidebar bleeds through the safe-area insets / overscroll that the
  // scrolled (document-flow) content doesn't cover (gray strips above/below the
  // content). So paint it only while it's actually being revealed. Bridge the
  // ~200ms close slide via `isClosingReveal` so it doesn't pop away mid-animation.
  useEffect(() => {
    if (isRevealed) {
      wasRevealedRef.current = true;
      setIsClosingReveal(false);
      return;
    }
    if (!wasRevealedRef.current) {
      return;
    }
    wasRevealedRef.current = false;
    setIsClosingReveal(true);
    const timer = window.setTimeout(() => setIsClosingReveal(false), 240);
    return () => window.clearTimeout(timer);
  }, [isRevealed]);

  return (
    <div className="relative w-full bg-background max-md:overflow-x-clip md:min-h-0 md:flex-1 md:overflow-hidden">
      {/* Sidebar layer — a FULL-WIDTH bg-sidebar backdrop fixed behind the
          content, revealed as the content slides. Full width (not just the nav
          width) so the sliding content always sits on bg-sidebar: any mismatch
          between the slide distance and the nav width — or the card's rounded
          corners — reveals bg-sidebar, never the bg-background swipe-outer. The
          nav itself is constrained to its real width by `navRef` (which also
          drives the slide distance). `visibility: hidden` when fully closed (not
          display:none — keep `navRef` measurable) so the fixed bg-sidebar can't
          bleed behind the content on iOS. */}
      <div
        aria-hidden={!openMobile}
        aria-label="Sidebar"
        aria-modal={openMobile}
        className="z-0 flex flex-col bg-sidebar text-sidebar-foreground outline-none max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:left-0 md:absolute md:inset-y-0 md:left-0"
        inert={!openMobile}
        ref={sidebarRef}
        role="dialog"
        style={{ visibility: revealActive ? undefined : "hidden" }}
        tabIndex={-1}
      >
        <div
          className="flex h-full flex-col"
          ref={navRef}
          style={{ width: SIDEBAR_WIDTH_MOBILE }}
        >
          {sidebar}
        </div>
      </div>

      {/* Content layer — slides right to reveal the sidebar; rounded inset when
          open. Stays in normal flow (document keeps its scroll height); rounded
          at the viewport band by `revealClipPath`. */}
      <div
        className={cn(
          // Mobile: natural height (`min-h-svh`) so the document — not this
          // layer — owns the scroll; desktop keeps `h-full` inside the fixed shell.
          "relative z-10 w-full bg-background transition-transform duration-200 ease-[var(--ease-drawer)] will-change-transform motion-reduce:transition-none max-md:min-h-svh md:h-full",
          isDragging && "transition-none",
          revealActive && "max-md:overflow-x-clip md:overflow-hidden"
        )}
        style={{
          transform: `translateX(${translateX}px)`,
          clipPath: revealClipPath,
        }}
      >
        <div className="w-full max-md:min-h-svh md:h-full" inert={openMobile}>
          {children}
        </div>

        {/* Dim scrim over the content; opacity tracks swipe progress. White in
            light mode (content recedes by washing out); near-black in dark mode
            (a white wash reads as a jarring brighten — dark dims instead). Pinned
            to the viewport band with `sticky top-0 height=viewport` and rounded
            with `border-radius` (NOT clip-path): the scrim's opacity transition
            composites it, and older iOS WebKit drops a composited layer's own
            `clip-path` corner radius — `border-radius` is honored there (the ring
            frame below uses the same technique and renders round on-device). */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
          <div
            className={cn(
              "sticky top-0 w-full rounded-3xl bg-white transition-opacity duration-200 ease-[var(--ease-drawer)] motion-reduce:transition-none dark:bg-black",
              isDragging && "transition-none",
              openMobile ? "pointer-events-auto" : "pointer-events-none"
            )}
            style={{
              height: viewportHeight,
              opacity: overlayProgress * OVERLAY_MAX_OPACITY,
              touchAction: "none",
            }}
            {...(openMobile ? gestureHandlers : {})}
          />
        </div>

        {/* Border outline. The content layer's own `ring` would draw at the
            document-tall box edges (off-screen); a viewport-sticky frame keeps
            the ring at the visible card edges, rounded with `border-radius`.
            Opacity tracks swipe progress (with a CSS transition) so it fades in/
            out with the slide instead of snapping off when a close commits. */}
        {revealActive ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20"
          >
            <div
              className={cn(
                "sticky top-0 rounded-3xl ring-1 ring-border ring-inset transition-opacity duration-200 ease-[var(--ease-drawer)] motion-reduce:transition-none",
                isDragging && "transition-none"
              )}
              style={{ height: viewportHeight, opacity: overlayProgress }}
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
