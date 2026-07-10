import {
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
} from "@tabler/icons-react";
import { type ReactNode, useCallback, useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";

/**
 * Linear-style right properties rail for the row-page family (virtual row
 * page, template editor, preview-as-row): an optional resizable side panel
 * holding the properties instead of the in-page section above the body.
 * One shared preference — expanded/collapsed persists in localStorage, the
 * panel split via the group's `autoSaveId` — so the choice follows the user
 * across rows and databases. Narrow viewports always use the in-page
 * section (a side panel has no room on phones).
 */

const RAIL_STORAGE_KEY = "site-row-properties-rail";

function readRailExpanded(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === "expanded";
  } catch {
    return false;
  }
}

export interface RowPropertiesRailState {
  /** True when the rail can render at all (wide viewport). */
  available: boolean;
  /** True when properties live in the side panel right now. */
  expanded: boolean;
  setExpanded: (next: boolean) => void;
}

/** Shared expanded/collapsed preference for the properties rail. */
export function useRowPropertiesRail(): RowPropertiesRailState {
  const isNarrowViewport = useIsNarrowViewport();
  const [expanded, setExpandedState] = useState(readRailExpanded);

  const setExpanded = useCallback((next: boolean) => {
    setExpandedState(next);
    try {
      window.localStorage.setItem(
        RAIL_STORAGE_KEY,
        next ? "expanded" : "collapsed"
      );
    } catch {
      // Private-mode storage restrictions — the toggle still works in-session.
    }
  }, []);

  return {
    available: !isNarrowViewport,
    expanded: expanded && !isNarrowViewport,
    setExpanded,
  };
}

/**
 * The split layout while the rail is expanded: main content left, properties
 * panel right, draggable divider between (split persisted via `autoSaveId`).
 */
export function RowPropertiesRailLayout({
  children,
  onCollapse,
  panel,
}: {
  children: ReactNode;
  onCollapse: () => void;
  panel: ReactNode;
}): ReactNode {
  return (
    <ResizablePanelGroup
      className="relative min-h-0 min-w-0 flex-1"
      id="row-properties-rail"
      orientation="horizontal"
    >
      <ResizablePanel
        className="flex h-full min-h-0 min-w-0 flex-col"
        id="row-main"
      >
        {children}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        className="flex h-full min-h-0 min-w-0 flex-col md:pl-1.5"
        defaultSize="20rem"
        id="row-properties"
        maxSize="32rem"
        minSize="14rem"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-background md:rounded-xl">
          <div className="flex h-10 shrink-0 items-center justify-between border-border border-b px-3">
            <span className="font-medium text-muted-foreground text-sm">
              Properties
            </span>
            <Button
              aria-label="Collapse properties panel"
              className="text-muted-foreground"
              onClick={onCollapse}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <IconLayoutSidebarRightCollapse />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {panel}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/** Hover-revealed "move properties to the side panel" affordance. */
export function RowPropertiesRailExpandButton({
  onExpand,
}: {
  onExpand: () => void;
}): ReactNode {
  return (
    <Button
      aria-label="Open properties in a side panel"
      className="hover-reveal shrink-0 text-muted-foreground"
      onClick={onExpand}
      size="icon-sm"
      title="Open properties in a side panel"
      type="button"
      variant="ghost"
    >
      <IconLayoutSidebarRightExpand />
    </Button>
  );
}
