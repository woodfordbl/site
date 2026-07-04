import { IconArrowsSort, IconFilter } from "@tabler/icons-react";
import type { ReactNode } from "react";

import {
  DatabaseFilterChips,
  DatabaseFilterMatchOp,
  DatabaseGroupByChip,
  DatabaseSortChips,
} from "@/components/database/database-filter-bar.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import type { DatabaseField, DatabaseView } from "@/lib/schemas/database.ts";

/**
 * Narrow-viewport replacement for the inline filter/sort chip bar: a funnel
 * and a sort icon button in the database title row, each opening a popover
 * with the same chip strips the desktop bar renders. An accent dot on the
 * icon marks active filters/sorts. Edit mode only, like the inline bar.
 */

// 320px popover capped below the viewport width so chips fit on 390px
// screens; Base UI's positioner collision padding keeps it off the edges.
const TOOLBAR_POPOVER_CLASS = "w-80 max-w-[calc(100vw-1rem)] p-2";

const CHIP_ROW_CLASS = "flex min-w-0 flex-wrap items-center gap-1.5";

/** Small accent dot marking an icon button as "has active state". */
function ActiveDot(): ReactNode {
  return (
    <span
      aria-hidden
      className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
    />
  );
}

interface ToolbarPopoverButtonProps {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  label: string;
}

/** Ghost icon-sm popover trigger with the shared active-dot badge. */
function ToolbarPopoverButton({
  active,
  children,
  icon,
  label,
}: ToolbarPopoverButtonProps): ReactNode {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={label}
            className="relative shrink-0 text-muted-foreground data-popup-open:bg-muted data-popup-open:text-foreground"
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {icon}
        {active ? <ActiveDot /> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className={TOOLBAR_POPOVER_CLASS}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export interface DatabaseMobileToolbarProps {
  databaseId: string;
  fields: readonly DatabaseField[];
  view: DatabaseView;
}

/** Funnel + sort icon buttons for the title row on narrow viewports. */
export function DatabaseMobileToolbar({
  databaseId,
  fields,
  view,
}: DatabaseMobileToolbarProps): ReactNode {
  const filterCount = view.filter?.conditions.length ?? 0;
  const sortCount = view.sorts?.length ?? 0;
  const isGrouped = view.groupBy !== undefined;

  return (
    <>
      <ToolbarPopoverButton
        active={filterCount > 0}
        icon={<IconFilter aria-hidden />}
        label={filterCount > 0 ? `Filters (${filterCount} active)` : "Filters"}
      >
        {/* Empty state keeps the add-filter flow reachable inside the
            surface: muted line, then the chip strip (just "+ Filter"). */}
        {filterCount === 0 ? (
          <p className="px-1 pb-2 text-muted-foreground text-sm">No filters</p>
        ) : null}
        <div className={CHIP_ROW_CLASS}>
          <DatabaseFilterChips
            className="contents"
            databaseId={databaseId}
            fields={fields}
            view={view}
          />
          <DatabaseFilterMatchOp databaseId={databaseId} view={view} />
        </div>
      </ToolbarPopoverButton>
      <ToolbarPopoverButton
        active={sortCount > 0 || isGrouped}
        icon={<IconArrowsSort aria-hidden />}
        label={sortCount > 0 ? `Sorts (${sortCount} active)` : "Sorts"}
      >
        {sortCount > 0 || isGrouped ? (
          <div className={CHIP_ROW_CLASS}>
            <DatabaseSortChips
              className="contents"
              databaseId={databaseId}
              fields={fields}
              view={view}
            />
            <DatabaseGroupByChip
              databaseId={databaseId}
              fields={fields}
              view={view}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1 px-1 py-0.5">
            <p className="text-muted-foreground text-sm">No sorts</p>
            <p className="text-muted-foreground/70 text-xs">
              Add one from a column header menu.
            </p>
          </div>
        )}
      </ToolbarPopoverButton>
    </>
  );
}
