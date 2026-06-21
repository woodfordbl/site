import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { sidebarWidthRemToCss } from "@/lib/pages/page-sidebar-layout-cookie.ts";
import { cn } from "@/lib/utils.ts";

const HOVER_CLOSE_DELAY_MS = 150;

/** Viewport-left hit strip width — must stay pointer-interactive while closed. */
const EDGE_HIT_WIDTH_PX = 12;

const PANEL_ENTER_MS = 220;
const PANEL_EXIT_MS = 150;
const BACKDROP_ENTER_MS = 200;
const BACKDROP_EXIT_MS = 150;

interface PageSidebarHoverRevealProps {
  children: ReactNode;
  sidebar: ReactNode;
  sidebarWidthRem: number;
}

function useMainPanelRect(containerRef: RefObject<HTMLDivElement | null>) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const panel = container.querySelector<HTMLElement>(
      "[data-page-main-panel]"
    );
    if (!panel) {
      return;
    }

    const update = () => {
      setRect(panel.getBoundingClientRect());
    };

    update();

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(panel);
    resizeObserver.observe(container);

    window.addEventListener("resize", update);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [containerRef]);

  return rect;
}

export function PageSidebarHoverReveal({
  children,
  sidebar,
  sidebarWidthRem,
}: PageSidebarHoverRevealProps) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRect = useMainPanelRect(containerRef);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const openOverlay = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  useEffect(
    () => () => {
      clearCloseTimer();
    },
    [clearCloseTimer]
  );

  const panelWidth = sidebarWidthRemToCss(sidebarWidthRem);
  const isPositioned = panelRect !== null && (panelRect?.height ?? 0) > 0;
  const panelLeft = panelRect?.left ?? 0;
  const panelTop = panelRect?.top ?? 0;
  const panelHeight = panelRect?.height ?? 0;
  const hoverHitWidth =
    open && panelRect
      ? `calc(${panelLeft}px + ${panelWidth})`
      : `${EDGE_HIT_WIDTH_PX}px`;

  return (
    <div className="relative h-full min-h-0 w-full" ref={containerRef}>
      <div className="relative h-full min-h-0 min-w-0 overflow-hidden md:px-2 md:pt-2">
        {children}
      </div>

      {/* Fixed to the viewport so scroll/overflow on main content cannot block edge hover. */}
      <div
        aria-hidden={!open}
        className="fixed inset-y-0 left-0 z-50"
        onPointerEnter={openOverlay}
        onPointerLeave={open ? scheduleClose : undefined}
        style={{ width: hoverHitWidth }}
      />

      <div
        aria-hidden={!open}
        className={cn(
          "pointer-events-none fixed inset-0 z-40 bg-foreground/5",
          "transition-opacity motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0"
        )}
        style={{
          transitionDuration: open
            ? `${BACKDROP_ENTER_MS}ms`
            : `${BACKDROP_EXIT_MS}ms`,
          transitionTimingFunction: "var(--ease-out-strong)",
        }}
      />

      <div
        aria-hidden={!open}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-sidebar text-sidebar-foreground shadow-lg",
          "transition-[transform,opacity,visibility] will-change-transform motion-reduce:transition-opacity",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
          isPositioned ? "visible" : "invisible"
        )}
        data-page-sidebar-hover-panel=""
        onPointerEnter={openOverlay}
        onPointerLeave={scheduleClose}
        style={{
          top: panelTop,
          left: panelLeft,
          height: panelHeight > 0 ? panelHeight : undefined,
          width: panelWidth,
          transform: open
            ? "translateX(0)"
            : "translateX(calc(-100% - 0.5rem))",
          transformOrigin: "left center",
          transitionDuration: open
            ? `${PANEL_ENTER_MS}ms`
            : `${PANEL_EXIT_MS}ms`,
          transitionTimingFunction: open
            ? "var(--ease-drawer)"
            : "var(--ease-out-strong)",
        }}
      >
        {sidebar}
      </div>
    </div>
  );
}
