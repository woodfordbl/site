import {
  IconCheck,
  IconChevronRight,
  IconLayoutSidebarRight,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
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
 * Right properties rail for the row-page family (virtual row page, template
 * editor, preview-as-row). The side panel is the DEFAULT; where properties
 * show is a per-database setting (`database.rowPropertiesPlacement`) switched
 * from the placement menu in the in-page section when set to top). Narrow
 * viewports always use the in-page section.
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
 * in-page properties section's top right (pass `hover-reveal` via className).
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
 * Scrollable properties panel body for rail mode — a bordered, collapsible
 * "Properties" section with a full-width header trigger and field rows below.
 */
function RowPropertiesRailPanelShell({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-4">
      {children ? (
        <div className="rounded-lg border border-border">
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="group/label flex h-8 w-full shrink-0 items-center gap-1 rounded-md px-2 text-left font-medium text-muted-foreground text-xs outline-hidden ring-ring transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2">
              <span className="min-w-0 flex-1 truncate">Properties</span>
              <IconChevronRight
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground/70 opacity-0 transition-[transform,opacity] duration-200 ease-[var(--ease-out-strong)] hover-none:opacity-100 group-hover/label:opacity-100 group-focus-visible/label:opacity-100 group-data-[panel-open]/label:rotate-90 motion-reduce:transition-none"
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-2 pb-2">{children}</div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Split layout while properties live in the side panel — wraps the page body
 * scroll region only (the host header bar stays full width above). The resize
 * handle is invisible until hovered or dragged.
 */
export function RowPropertiesRailLayout({
  children,
  panel,
}: {
  children: ReactNode;
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
        <RowPropertiesRailPanelShell>{panel}</RowPropertiesRailPanelShell>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
