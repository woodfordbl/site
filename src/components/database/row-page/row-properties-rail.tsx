import { IconCheck, IconLayoutSidebarRight } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable.tsx";
import { setDatabaseRowPropertiesPlacement } from "@/db/queries/database-collection-ops.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Linear-style right properties rail for the row-page family (virtual row
 * page, template editor, preview-as-row). The side panel is the DEFAULT;
 * where properties show is a per-database setting
 * (`database.rowPropertiesPlacement`) switched from the placement menu in
 * the page's top right — no expand/collapse toggles. Narrow viewports
 * always use the in-page section (a side panel has no room on phones).
 */

export type RowPropertiesPlacement = "panel" | "top";

export interface RowPropertiesRailState {
  /** True when properties live in the side panel right now. */
  panelMode: boolean;
  placement: RowPropertiesPlacement;
}

/** Resolves the database's properties placement against the viewport. */
export function useRowPropertiesRail(
  database: LocalDatabase | undefined
): RowPropertiesRailState {
  const isNarrowViewport = useIsNarrowViewport();
  const placement = database?.rowPropertiesPlacement ?? "panel";
  return {
    panelMode: placement === "panel" && !isNarrowViewport,
    placement,
  };
}

const PLACEMENT_OPTIONS: Array<{
  label: string;
  value: RowPropertiesPlacement;
}> = [
  { label: "Side panel", value: "panel" },
  { label: "Top of page", value: "top" },
];

/**
 * The per-page "where do properties show" setting: a small menu in the
 * page's top right — the properties band in panel mode, the in-page
 * section's corner in top mode (pass `hover-reveal` there via className).
 */
export function RowPropertiesPlacementMenu({
  className,
  database,
}: {
  className?: string;
  database: LocalDatabase;
}): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const placement = database.rowPropertiesPlacement ?? "panel";
  // Phones never render the side panel, so the setting has nothing to move.
  if (isNarrowViewport) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        nativeButton
        render={
          <Button
            aria-label="Properties position"
            className={cn(
              "shrink-0 text-muted-foreground data-popup-open:opacity-100",
              className
            )}
            size="icon-sm"
            title="Properties position"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconLayoutSidebarRight />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PLACEMENT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => {
              setDatabaseRowPropertiesPlacement(database.id, option.value);
            }}
          >
            <span className="min-w-0 flex-1">{option.label}</span>
            {placement === option.value ? (
              <IconCheck aria-hidden className="size-4 shrink-0" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The split layout while properties live in the panel — rendered by hosts
 * INSIDE their page canvas, wrapping header + scroll region. The panel's
 * "Properties" band matches the host header bar's height and bottom border
 * (36px content + 1px border), so the two read as one full-width header
 * line; there is no visible divider between content and panel (the resize
 * handle is invisible until hovered/dragged).
 */
export function RowPropertiesRailLayout({
  children,
  database,
  panel,
}: {
  children: ReactNode;
  database: LocalDatabase;
  panel: ReactNode;
}): ReactNode {
  return (
    <ResizablePanelGroup
      className="min-h-0 min-w-0 flex-1"
      id="row-properties-rail"
      orientation="horizontal"
    >
      <ResizablePanel
        className="flex h-full min-h-0 min-w-0 flex-col"
        id="row-main"
      >
        {children}
      </ResizablePanel>
      <ResizableHandle className="bg-transparent transition-colors hover:bg-border active:bg-border" />
      <ResizablePanel
        className="flex h-full min-h-0 min-w-0 flex-col"
        defaultSize="19rem"
        id="row-properties"
        maxSize="30rem"
        minSize="13rem"
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* h-[37px] = the host header bars' 36px content + 1px border, so
            the two bottom borders draw one continuous line. */}
          <div className="flex h-[37px] shrink-0 items-center justify-between border-sidebar-border border-b bg-background pr-2 pl-5">
            <span className="font-medium text-muted-foreground text-sm">
              Properties
            </span>
            <RowPropertiesPlacementMenu database={database} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-4">
            {panel}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
