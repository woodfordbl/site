import {
  IconChartBar,
  IconLayoutKanban,
  IconList,
  IconPlus,
  IconTable,
} from "@tabler/icons-react";
import type { ComponentType, ReactNode } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { addDatabaseView } from "@/db/queries/database-collection-ops.ts";
import type { DatabaseView, DatabaseViewType } from "@/lib/schemas/database.ts";

/** View-type glyphs shared by the switcher tabs and the Add-view menus. */
export const DATABASE_VIEW_TYPE_ICONS: Record<
  DatabaseViewType,
  ComponentType<{ className?: string }>
> = {
  table: IconTable,
  list: IconList,
  board: IconLayoutKanban,
  chart: IconChartBar,
};

/** View-type display labels ("Table" / "List" / "Board" / "Chart"). */
export const DATABASE_VIEW_TYPE_LABELS: Record<DatabaseViewType, string> = {
  table: "Table",
  list: "List",
  board: "Board",
  chart: "Chart",
};

const VIEW_TYPES: DatabaseViewType[] = ["table", "list", "board", "chart"];

interface AddDatabaseViewMenuItemsProps {
  databaseId: string;
  /** Called with the created view's id — callers activate it. */
  onCreated?: (viewId: string) => void;
}

/**
 * The four "Add view" rows (type icon + label), shared by the switcher's "+"
 * menu and the settings menu's Views submenu so both create views the same
 * way (`addDatabaseView` per-type defaults).
 */
export function AddDatabaseViewMenuItems({
  databaseId,
  onCreated,
}: AddDatabaseViewMenuItemsProps): ReactNode {
  return VIEW_TYPES.map((type) => {
    const TypeIcon = DATABASE_VIEW_TYPE_ICONS[type];
    return (
      <DropdownMenuItem
        key={type}
        onClick={() => {
          const created = addDatabaseView(databaseId, { type });
          if (created) {
            onCreated?.(created.id);
          }
        }}
      >
        <TypeIcon className="stroke-[1.5px]" />
        {DATABASE_VIEW_TYPE_LABELS[type]}
      </DropdownMenuItem>
    );
  });
}

export interface DatabaseViewSwitcherProps {
  /** The resolved active view id (always one of `views`). */
  activeViewId: string;
  databaseId: string;
  mode: "view" | "edit";
  /**
   * Activates a view. Edit mode persists it onto the hosting block
   * (`props.viewId`); view mode falls back to ephemeral local state in the
   * entry — this callback never knows the difference.
   */
  onViewIdChange: (viewId: string) => void;
  views: DatabaseView[];
}

/**
 * Compact saved-view tabs in the database title row: TabsList `indicator`
 * variant, one tab per view (type icon + name), horizontally scrollable when
 * the row overflows. Edit mode appends a "+" opening the Add-view menu; view
 * mode is switch-only (and hides entirely for single-view databases, where
 * there is nothing to switch).
 */
export function DatabaseViewSwitcher({
  activeViewId,
  databaseId,
  mode,
  onViewIdChange,
  views,
}: DatabaseViewSwitcherProps): ReactNode {
  if (mode === "view" && views.length <= 1) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center">
      <div className="no-scrollbar min-w-0 overflow-x-auto">
        <Tabs
          onValueChange={(value) => {
            onViewIdChange(String(value));
          }}
          value={activeViewId}
        >
          <TabsList className="flex-nowrap" size="sm" variant="indicator">
            {views.map((view) => {
              const TypeIcon = DATABASE_VIEW_TYPE_ICONS[view.type];
              return (
                <TabsTrigger
                  className="flex-none shrink-0"
                  key={view.id}
                  value={view.id}
                >
                  <TypeIcon className="stroke-[1.5px]" />
                  <span className="max-w-32 truncate">{view.name}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>
      {mode === "edit" ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            nativeButton
            render={
              <Button
                aria-label="Add view"
                className="shrink-0 text-muted-foreground"
                size="icon-xs"
                type="button"
                variant="ghost"
              />
            }
          >
            <IconPlus aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <AddDatabaseViewMenuItems
              databaseId={databaseId}
              onCreated={onViewIdChange}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
