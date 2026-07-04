import { IconArrowsSort, IconFilter } from "@tabler/icons-react";
import type { ReactNode } from "react";

import {
  AddSortButton,
  DatabaseFilterChips,
  DatabaseFilterMatchOp,
  DatabaseGroupByChip,
  DatabaseSortChips,
} from "@/components/database/database-filter-bar.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
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

/** Centered-icon empty state for the filter/sort drawers. */
function ToolbarEmptyState({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}): ReactNode {
  return (
    <Empty className="border-0 p-2">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

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
        <div className="flex flex-col gap-2">
          {filterCount === 0 ? (
            <ToolbarEmptyState
              description="Filter rows by a property's value."
              icon={<IconFilter />}
              title="No filters"
            />
          ) : (
            <div className={CHIP_ROW_CLASS}>
              <DatabaseFilterChips
                addFullWidth
                className="contents"
                databaseId={databaseId}
                fields={fields}
                view={view}
              />
              <DatabaseFilterMatchOp databaseId={databaseId} view={view} />
            </div>
          )}
          {/* Empty state hides the chips' inline add, so surface a full-width
              add here; when filters exist the strip renders its own full-width
              add and this stays hidden. */}
          {filterCount === 0 ? (
            <DatabaseFilterChips
              addFullWidth
              className="contents"
              databaseId={databaseId}
              fields={fields}
              view={view}
            />
          ) : null}
        </div>
      </ToolbarPopoverButton>
      <ToolbarPopoverButton
        active={sortCount > 0 || isGrouped}
        icon={<IconArrowsSort aria-hidden />}
        label={sortCount > 0 ? `Sorts (${sortCount} active)` : "Sorts"}
      >
        <div className="flex flex-col gap-2">
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
            <ToolbarEmptyState
              description="Order rows by a property."
              icon={<IconArrowsSort />}
              title="No sorts"
            />
          )}
          <AddSortButton
            databaseId={databaseId}
            fields={fields}
            fullWidth
            view={view}
          />
        </div>
      </ToolbarPopoverButton>
    </>
  );
}
