import {
  IconCheck,
  IconDots,
  IconLayoutNavbar,
  IconLayoutSidebarRight,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

import { visibleFieldIdsAfterHide } from "@/components/database/database-column-menu-helpers.ts";
import { DatabasePropertiesList } from "@/components/database/database-properties-list.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleCaret,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  setDatabaseRowPropertiesPlacement,
  setDatabaseRowPropertiesVisibleFieldIds,
} from "@/db/queries/database-collection-ops.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { pageCanvasDesktopScrollTopInsetClassName } from "@/lib/pages/page-title-layout.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Right properties rail for the row-page family (virtual row page, template
 * editor, preview-as-row). Properties under the title are the DEFAULT; where
 * they show is a per-database setting (`database.rowPropertiesPlacement`)
 * switched from the Properties ⋯ menu (also on the in-page section). Narrow
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
  // Default under the title (Notion-style); side panel is opt-in per database.
  const placement = database?.rowPropertiesPlacement ?? "top";
  return {
    panelMode: placement === "panel" && !isNarrowViewport,
    placement,
  };
}

/**
 * Shared PageWorkspace chrome for the row-page family: side-panel
 * `contentWrapper` when placement is panel, otherwise title hosts own the
 * under-title band via `RowPropertiesUnderTitleBand`.
 */
export function useRowPageWorkspaceChrome(
  database: LocalDatabase | undefined,
  options: {
    propertiesPanel: ReactNode;
  }
): RowPropertiesRailState & {
  contentWrapper?: (canvasRegion: ReactNode) => ReactNode;
} {
  const rail = useRowPropertiesRail(database);
  if (!(database && rail.panelMode)) {
    return rail;
  }

  return {
    ...rail,
    contentWrapper: (canvasRegion) => (
      <RowPropertiesRailLayout
        database={database}
        panel={options.propertiesPanel}
      >
        {canvasRegion}
      </RowPropertiesRailLayout>
    ),
  };
}

/** Under-title properties band shared by row / template / preview titles. */
export function RowPropertiesUnderTitleBand({
  children,
  propertiesExtra,
}: {
  children: ReactNode;
  propertiesExtra?: ReactNode;
}): ReactNode {
  return (
    <div
      className="relative mt-6 mb-4 border-border border-b pb-3"
      data-reveal-group=""
    >
      {propertiesExtra ? (
        <div className="absolute top-0 right-0 z-10">{propertiesExtra}</div>
      ) : null}
      {children}
    </div>
  );
}

/** Wait before showing rail hints so quick passes do not flash tooltips. */
const RAIL_TOOLTIP_DELAY_MS = 300;

const PLACEMENT_OPTIONS: Array<{
  icon: typeof IconLayoutSidebarRight;
  label: string;
  value: RowPropertiesPlacement;
}> = [
  {
    icon: IconLayoutSidebarRight,
    label: "Side panel",
    value: "panel",
  },
  {
    icon: IconLayoutNavbar,
    label: "Top of page",
    value: "top",
  },
];

/**
 * Properties ⋯ menu: placement (desktop) plus the shared show/hide/reorder
 * property list. Visibility writes `rowPropertiesVisibleFieldIds` (DB-wide,
 * independent of table views). Used on the rail header and as the inline
 * section's hover-reveal action.
 */
export function RowPropertiesOptionsMenu({
  className,
  database,
}: {
  className?: string;
  database: LocalDatabase;
}): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const placement = database.rowPropertiesPlacement ?? "top";

  const isVisible = (fieldId: string): boolean =>
    !database.rowPropertiesVisibleFieldIds ||
    database.rowPropertiesVisibleFieldIds.includes(fieldId);

  const toggleVisible = (fieldId: string) => {
    const allFieldIds = database.fields.map((field) => field.id);
    const next = isVisible(fieldId)
      ? visibleFieldIdsAfterHide(
          database.rowPropertiesVisibleFieldIds,
          allFieldIds,
          fieldId
        )
      : [...(database.rowPropertiesVisibleFieldIds ?? allFieldIds), fieldId];
    setDatabaseRowPropertiesVisibleFieldIds(database.id, next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        nativeButton
        render={
          <Button
            aria-label="Properties options"
            className={cn(
              "shrink-0 text-muted-foreground data-popup-open:opacity-100",
              className
            )}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconDots aria-hidden className="size-4 stroke-[1.5px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 min-w-64">
        {isNarrowViewport ? null : (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Layout</DropdownMenuLabel>
              {PLACEMENT_OPTIONS.map((option) => {
                const OptionIcon = option.icon;
                return (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => {
                      setDatabaseRowPropertiesPlacement(
                        database.id,
                        option.value
                      );
                    }}
                  >
                    <OptionIcon />
                    <span className="min-w-0 flex-1">{option.label}</span>
                    {placement === option.value ? (
                      <IconCheck aria-hidden className="size-4 shrink-0" />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Properties</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DatabasePropertiesList
          database={database}
          isVisible={isVisible}
          onToggleVisible={toggleVisible}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Scrollable properties panel body for rail mode — a bordered, collapsible
 * "Properties" section with a hover-reveal ⋯ menu on the header and field
 * rows below.
 */
function RowPropertiesRailPanelShell({
  children,
  database,
}: {
  children: ReactNode;
  database: LocalDatabase;
}): ReactNode {
  return (
    <div
      className={cn(
        "relative min-h-0 flex-1 overflow-y-auto px-3 pb-4",
        pageCanvasDesktopScrollTopInsetClassName
      )}
    >
      <div className="rounded-lg border border-border">
        <Collapsible defaultOpen>
          <div className="relative flex items-center" data-reveal-group="">
            <CollapsibleTrigger className="group/label flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 pr-8 text-left font-medium text-muted-foreground text-xs outline-hidden ring-ring transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2">
              <span className="truncate">Properties</span>
              <CollapsibleCaret />
            </CollapsibleTrigger>
            <div className="absolute top-1/2 right-1 z-10 -translate-y-1/2">
              <RowPropertiesOptionsMenu
                className="hover-reveal"
                database={database}
              />
            </div>
          </div>
          <CollapsibleContent>
            <div className="px-2 pb-2">{children}</div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

/** Resize divider between canvas and properties panel. */
function RowPropertiesResizeHandle(): ReactNode {
  return (
    <TooltipProvider delay={RAIL_TOOLTIP_DELAY_MS}>
      <Tooltip trackCursorAxis="y">
        <TooltipTrigger
          render={
            <ResizableHandle
              aria-label="Drag to resize"
              className={cn(
                // Wider transparent hit target (react-resizable-panels pads to 10px anyway).
                "w-3 cursor-col-resize bg-transparent outline-none ring-0",
                // Visible w-0.5 rail only on the center line — matches PageSidebarRail pattern.
                "after:w-0.5 after:bg-transparent after:transition-colors",
                "hover:after:bg-selection-primary",
                "data-[separator=active]:after:bg-selection-primary",
                "focus-visible:outline-none focus-visible:ring-0"
              )}
            />
          }
        />
        <TooltipContent showArrow={false} side="left" sideOffset={8}>
          Drag to resize
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Split layout while properties live in the side panel — wraps the page body
 * scroll region only (the host header bar stays full width above). The resize
 * handle is invisible until hovered or dragged, then shows a centered w-0.5
 * selection line inside a wider transparent hit target, with a cursor-tracking
 * tooltip.
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
      disableCursor
      id="row-properties-rail"
      orientation="horizontal"
    >
      <ResizablePanel
        className="flex h-full min-h-0 min-w-0 flex-col"
        id="row-main"
      >
        {children}
      </ResizablePanel>
      <RowPropertiesResizeHandle />
      <ResizablePanel
        className="flex h-full min-h-0 min-w-0 flex-col"
        defaultSize="19rem"
        id="row-properties"
        maxSize="30rem"
        minSize="13rem"
      >
        <RowPropertiesRailPanelShell database={database}>
          {panel}
        </RowPropertiesRailPanelShell>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
