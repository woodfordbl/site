import { useRouteContext } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
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
  PAGE_SIDEBAR_MAX_WIDTH_REM,
  PAGE_SIDEBAR_MIN_WIDTH_REM,
  PAGE_SIDEBAR_PANEL_ID,
  pixelsToRem,
  sidebarWidthRemToCss,
  writePageSidebarWidthToDocument,
} from "@/lib/pages/page-sidebar-layout-cookie.ts";
import {
  type PageSidebarPin,
  writePageSidebarPinToDocument,
} from "@/lib/pages/page-sidebar-pin-cookie.ts";

const PAGE_SIDEBAR_LAYOUT_GROUP_ID = "page-workspace";

interface PageSidebarChromeContextValue {
  collapseSidebar: () => void;
  commitSidebarWidth: () => void;
  isCollapsed: boolean;
  pin: PageSidebarPin;
  pinSidebar: () => void;
  resizeSidebarToPointerX: (clientX: number) => void;
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
  const sidebarPanelRef = usePanelRef();
  const [pin, setPin] = useState<PageSidebarPin>(sidebarPrefs.pin);
  const [sidebarWidthRem, setSidebarWidthRem] = useState(sidebarPrefs.widthRem);

  const pinSidebar = useCallback(() => {
    setPin("pinned");
    writePageSidebarPinToDocument("pinned");
  }, []);

  const collapseSidebar = useCallback(() => {
    setPin("collapsed");
    writePageSidebarPinToDocument("collapsed");
  }, []);

  const toggleSidebar = useCallback(() => {
    if (pin === "pinned") {
      collapseSidebar();
    } else {
      pinSidebar();
    }
  }, [collapseSidebar, pin, pinSidebar]);

  const resizeSidebarToPointerX = useCallback(
    (clientX: number) => {
      const panel = sidebarPanelRef.current;
      if (!panel) {
        return;
      }

      const rem = clampSidebarWidthRem(pixelsToRem(clientX));
      panel.resize(sidebarWidthRemToCss(rem));
      setSidebarWidthRem(rem);
    },
    [sidebarPanelRef]
  );

  const commitSidebarWidth = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) {
      return;
    }

    const rem = clampSidebarWidthRem(pixelsToRem(panel.getSize().inPixels));
    setSidebarWidthRem(rem);
    writePageSidebarWidthToDocument(rem);
  }, [sidebarPanelRef]);

  const handleSidebarResize = useCallback(
    (
      _panelSize: PanelSize,
      _id: string | number | undefined,
      prevSize: PanelSize | undefined
    ) => {
      if (prevSize === undefined) {
        return;
      }

      const panel = sidebarPanelRef.current;
      if (!panel) {
        return;
      }

      const rem = pixelsToRem(panel.getSize().inPixels);
      setSidebarWidthRem(rem);
      writePageSidebarWidthToDocument(rem);
    },
    [sidebarPanelRef]
  );

  useCommandHotkeys({ "toggle-sidebar": toggleSidebar });

  const isCollapsed = pin === "collapsed";

  const contextValue = useMemo<PageSidebarChromeContextValue>(
    () => ({
      pin,
      isCollapsed,
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
          maxSize={sidebarWidthRemToCss(PAGE_SIDEBAR_MAX_WIDTH_REM)}
          minSize={sidebarWidthRemToCss(PAGE_SIDEBAR_MIN_WIDTH_REM)}
          onResize={handleSidebarResize}
          panelRef={sidebarPanelRef}
          style={{ overflow: "hidden" }}
        >
          {sidebar}
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
