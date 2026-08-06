import { useRouteContext } from "@tanstack/react-router";
import { animate } from "motion";
import { useReducedMotion } from "motion/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type PanelSize, usePanelRef } from "react-resizable-panels";

import { useCommandHotkeys } from "@/components/keyboard/use-command-hotkeys.ts";
import { PageSidebarHoverReveal } from "@/components/pages/page-sidebar-hover-reveal.tsx";
import { PageSidebarSwipeReveal } from "@/components/pages/page-sidebar-swipe-reveal.tsx";
import {
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable.tsx";
import { SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import {
  clampSidebarWidthRem,
  PAGE_MAIN_PANEL_ID,
  PAGE_SIDEBAR_COLLAPSED_GUTTER_REM,
  PAGE_SIDEBAR_PANEL_ID,
  pixelsToRem,
  readRootFontSizePx,
  resolveSidebarPointerResize,
  type SidebarPointerResizeResult,
  sidebarPanelMaxSizeCss,
  sidebarPanelMinSizeCss,
  sidebarVisualWidthRemToCss,
  sidebarWidthRemToCss,
  writePageSidebarWidthToDocument,
} from "@/lib/pages/page-sidebar-layout-cookie.ts";
import {
  type PageSidebarPin,
  writePageSidebarPinToDocument,
} from "@/lib/pages/page-sidebar-pin-cookie.ts";

const PAGE_SIDEBAR_LAYOUT_GROUP_ID = "page-workspace";

/** Subtle spring when releasing past a rubber-band limit (Emil duration/bounce). */
const SIDEBAR_SETTLE_SPRING = {
  type: "spring" as const,
  duration: 0.45,
  bounce: 0.2,
};

/** Full pointer-triggered collapse: quick, restrained, and lightly springy. */
const SIDEBAR_COLLAPSE_SPRING = {
  type: "spring" as const,
  duration: 0.34,
  bounce: 0.05,
};

const SIDEBAR_CONTENT_EXIT = {
  duration: 0.18,
  ease: [0.23, 1, 0.32, 1] as const,
};

/** Treat near-limit visuals as already settled (skip spring). */
const SIDEBAR_SETTLE_EPSILON_REM = 0.01;

interface SidebarSettleAnimation {
  stop: () => void;
}

interface PageSidebarChromeContextValue {
  collapseSidebar: (animated?: boolean) => void;
  commitSidebarWidth: () => void;
  isCollapsed: boolean;
  isCollapsing: boolean;
  pin: PageSidebarPin;
  pinSidebar: () => void;
  resizeSidebarToPointerX: (clientX: number) => SidebarPointerResizeResult;
  toggleSidebar: () => void;
}

const PageSidebarChromeContext =
  createContext<PageSidebarChromeContextValue | null>(null);

export function usePageSidebarChrome() {
  const context = useContext(PageSidebarChromeContext);
  if (!context) {
    throw new Error(
      "usePageSidebarChrome must be used within PageSidebarChromeProvider."
    );
  }

  return context;
}

export function useOptionalPageSidebarChrome(): PageSidebarChromeContextValue | null {
  return useContext(PageSidebarChromeContext);
}

interface PageSidebarChromeProviderProps {
  children: ReactNode;
  sidebar: ReactNode;
}

export function PageSidebarChromeProvider({
  children,
  sidebar,
}: PageSidebarChromeProviderProps) {
  const { sidebarPrefs } = useRouteContext({ from: "__root__" });
  const isNarrowViewport = useIsNarrowViewport();
  const shouldReduceMotion = useReducedMotion();
  const sidebarPanelRef = usePanelRef();
  const settleAnimationRef = useRef<SidebarSettleAnimation | null>(null);
  const contentAnimationRef = useRef<SidebarSettleAnimation | null>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const isSettlingRef = useRef(false);
  const [pin, setPin] = useState<PageSidebarPin>(sidebarPrefs.pin);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [sidebarWidthRem, setSidebarWidthRem] = useState(sidebarPrefs.widthRem);

  const cancelSidebarSettle = useCallback((resetCollapsing = true) => {
    settleAnimationRef.current?.stop();
    contentAnimationRef.current?.stop();
    settleAnimationRef.current = null;
    contentAnimationRef.current = null;
    isSettlingRef.current = false;
    if (resetCollapsing) {
      setIsCollapsing(false);
    }

    const content = sidebarContentRef.current;
    if (content) {
      content.style.removeProperty("filter");
      content.style.removeProperty("opacity");
    }
  }, []);

  useEffect(() => () => cancelSidebarSettle(false), [cancelSidebarSettle]);

  const persistSidebarWidth = useCallback((rem: number) => {
    const clamped = clampSidebarWidthRem(rem);
    setSidebarWidthRem(clamped);
    writePageSidebarWidthToDocument(clamped);
  }, []);

  const pinSidebar = useCallback(() => {
    const wasCollapsing = isCollapsing;
    cancelSidebarSettle();
    if (wasCollapsing) {
      sidebarPanelRef.current?.resize(sidebarWidthRemToCss(sidebarWidthRem));
    }
    setPin("pinned");
    writePageSidebarPinToDocument("pinned");
  }, [cancelSidebarSettle, isCollapsing, sidebarPanelRef, sidebarWidthRem]);

  const collapseSidebar = useCallback(
    (animated = true) => {
      cancelSidebarSettle();

      const panel = sidebarPanelRef.current;
      const content = sidebarContentRef.current;
      const shouldAnimate = animated && !shouldReduceMotion && panel !== null;

      if (!shouldAnimate) {
        setIsCollapsing(false);
        setPin("collapsed");
        writePageSidebarPinToDocument("collapsed");
        return;
      }

      const visualRem = pixelsToRem(panel.getSize().inPixels);
      isSettlingRef.current = true;
      setIsCollapsing(true);

      if (content) {
        contentAnimationRef.current = animate(
          content,
          {
            opacity: 0,
            filter: "blur(4px)",
          },
          SIDEBAR_CONTENT_EXIT
        );
      }

      const collapsedGutterRem = PAGE_SIDEBAR_COLLAPSED_GUTTER_REM;
      settleAnimationRef.current = animate(visualRem, collapsedGutterRem, {
        ...SIDEBAR_COLLAPSE_SPRING,
        onUpdate: (value) => {
          panel.resize(
            sidebarVisualWidthRemToCss(Math.max(collapsedGutterRem, value))
          );
        },
        onComplete: () => {
          settleAnimationRef.current = null;
          contentAnimationRef.current = null;
          isSettlingRef.current = false;
          setIsCollapsing(false);
          setPin("collapsed");
          writePageSidebarPinToDocument("collapsed");
        },
      });
    },
    [cancelSidebarSettle, shouldReduceMotion, sidebarPanelRef]
  );

  const toggleSidebar = useCallback(() => {
    if (pin === "pinned") {
      // Keyboard-initiated actions stay immediate.
      collapseSidebar(false);
    } else {
      pinSidebar();
    }
  }, [collapseSidebar, pin, pinSidebar]);

  const resizeSidebarToPointerX = useCallback(
    (clientX: number): SidebarPointerResizeResult => {
      cancelSidebarSettle();
      const panel = sidebarPanelRef.current;
      const result = resolveSidebarPointerResize(clientX, readRootFontSizePx());

      if (panel) {
        panel.resize(sidebarVisualWidthRemToCss(result.visualWidthRem));
      }

      setSidebarWidthRem(result.widthRem);
      return result;
    },
    [cancelSidebarSettle, sidebarPanelRef]
  );

  const commitSidebarWidth = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) {
      return;
    }

    const visualRem = pixelsToRem(panel.getSize().inPixels);
    const targetRem = clampSidebarWidthRem(visualRem);
    const shouldSnap =
      shouldReduceMotion ||
      Math.abs(visualRem - targetRem) < SIDEBAR_SETTLE_EPSILON_REM;

    if (shouldSnap) {
      cancelSidebarSettle();
      panel.resize(sidebarWidthRemToCss(targetRem));
      persistSidebarWidth(targetRem);
      return;
    }

    cancelSidebarSettle();
    isSettlingRef.current = true;
    settleAnimationRef.current = animate(visualRem, targetRem, {
      ...SIDEBAR_SETTLE_SPRING,
      onUpdate: (value) => {
        panel.resize(sidebarVisualWidthRemToCss(value));
      },
      onComplete: () => {
        settleAnimationRef.current = null;
        isSettlingRef.current = false;
        panel.resize(sidebarWidthRemToCss(targetRem));
        persistSidebarWidth(targetRem);
      },
    });
  }, [
    cancelSidebarSettle,
    persistSidebarWidth,
    shouldReduceMotion,
    sidebarPanelRef,
  ]);

  const handleSidebarResize = useCallback(
    (
      _panelSize: PanelSize,
      _id: string | number | undefined,
      prevSize: PanelSize | undefined
    ) => {
      // Skip the initial mount report and spring-settle frames — persistence
      // is owned by commitSidebarWidth / resizeSidebarToPointerX.
      if (prevSize === undefined || isSettlingRef.current) {
        return;
      }

      const panel = sidebarPanelRef.current;
      if (!panel) {
        return;
      }

      persistSidebarWidth(pixelsToRem(panel.getSize().inPixels));
    },
    [persistSidebarWidth, sidebarPanelRef]
  );

  useCommandHotkeys({ "toggle-sidebar": toggleSidebar });

  const isCollapsed = pin === "collapsed";

  const contextValue = useMemo<PageSidebarChromeContextValue>(
    () => ({
      pin,
      isCollapsed,
      isCollapsing,
      pinSidebar,
      collapseSidebar,
      toggleSidebar,
      resizeSidebarToPointerX,
      commitSidebarWidth,
    }),
    [
      collapseSidebar,
      commitSidebarWidth,
      isCollapsed,
      isCollapsing,
      pin,
      pinSidebar,
      resizeSidebarToPointerX,
      toggleSidebar,
    ]
  );

  const sidebarDefaultSize = sidebarWidthRemToCss(sidebarWidthRem);

  const chromeBody = (() => {
    if (isNarrowViewport) {
      return (
        <PageSidebarSwipeReveal sidebar={sidebar}>
          {children}
        </PageSidebarSwipeReveal>
      );
    }

    if (isCollapsed) {
      return (
        <PageSidebarHoverReveal
          onPin={pinSidebar}
          sidebar={sidebar}
          sidebarWidthRem={sidebarWidthRem}
        >
          {children}
        </PageSidebarHoverReveal>
      );
    }

    return (
      <ResizablePanelGroup
        className="relative h-full min-h-0 w-full"
        // Pointer resize is owned by PageSidebarRail (imperative panel.resize()).
        disabled
        id={PAGE_SIDEBAR_LAYOUT_GROUP_ID}
        orientation="horizontal"
      >
        <ResizablePanel
          className="h-full min-h-0 min-w-0 overflow-hidden"
          defaultSize={sidebarDefaultSize}
          groupResizeBehavior="preserve-pixel-size"
          id={PAGE_SIDEBAR_PANEL_ID}
          maxSize={sidebarPanelMaxSizeCss()}
          minSize={sidebarPanelMinSizeCss()}
          onResize={handleSidebarResize}
          panelRef={sidebarPanelRef}
          style={{ overflow: "hidden" }}
        >
          <div className="h-full min-h-0 w-full" ref={sidebarContentRef}>
            {sidebar}
          </div>
        </ResizablePanel>
        <ResizablePanel
          className="h-full min-h-0 min-w-0 overflow-hidden"
          id={PAGE_MAIN_PANEL_ID}
          style={{ overflow: "hidden" }}
        >
          <div className="h-full min-h-0 overflow-hidden md:pt-2 md:pr-2">
            {children}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  })();

  return (
    <PageSidebarChromeContext.Provider value={contextValue}>
      <SidebarProvider className="relative flex min-h-0 w-full flex-col max-md:h-auto md:h-full">
        {chromeBody}
      </SidebarProvider>
    </PageSidebarChromeContext.Provider>
  );
}
