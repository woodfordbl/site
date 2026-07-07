import { IconArrowsSort, IconFilter } from "@tabler/icons-react";
import type { ReactElement, ReactNode } from "react";
import { FieldPickerDropdown } from "@/components/database/database-filter-bar.tsx";
import { appendFilterCondition } from "@/components/database/database-filter-helpers.ts";
import { Button } from "@/components/ui/button.tsx";
import { updateDatabaseView } from "@/db/queries/database-collection-ops.ts";
import { FIELD_TYPE_DEFS } from "@/lib/databases/field-defs.ts";
import type { DatabaseField, DatabaseView } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Filter/sort icon triggers in the database title row (edit mode). Each icon is
 * a bar toggle when its category already exists (filters, sorts, or grouping)
 * and a field dropdown when that category is still empty. Adding from a
 * dropdown expands the inline chip bar. Icons use `.hover-reveal` under the
 * title's `data-reveal-group`.
 */

/** Small accent dot marking an icon button as "has active state". */
function ActiveDot(): ReactNode {
  return (
    <span
      aria-hidden
      className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
    />
  );
}

interface ToolbarToggleButtonProps {
  active: boolean;
  icon: ReactNode;
  label: string;
  onToggle: () => void;
  pressed: boolean;
}

/** Ghost icon-sm toggle for filter/sort chip bar visibility. */
function ToolbarToggleButton({
  active,
  icon,
  label,
  onToggle,
  pressed,
}: ToolbarToggleButtonProps): ReactNode {
  return (
    <Button
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "hover-reveal relative shrink-0 text-muted-foreground",
        active && "opacity-100",
        pressed && "bg-muted text-foreground"
      )}
      onClick={onToggle}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {icon}
      {active ? <ActiveDot /> : null}
    </Button>
  );
}

interface ToolbarFieldDropdownButtonProps {
  emptyLabel?: string;
  fields: readonly DatabaseField[];
  icon: ReactNode;
  label: string;
  onPick: (field: DatabaseField) => void;
}

/** Ghost icon-sm dropdown trigger with hover-reveal. */
function ToolbarFieldDropdownButton({
  emptyLabel,
  fields,
  icon,
  label,
  onPick,
}: ToolbarFieldDropdownButtonProps): ReactNode {
  const trigger = (
    <Button
      aria-label={label}
      className="hover-reveal relative shrink-0 text-muted-foreground data-popup-open:bg-muted data-popup-open:text-foreground data-popup-open:opacity-100"
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {icon}
    </Button>
  ) as ReactElement;

  return (
    <FieldPickerDropdown
      emptyLabel={emptyLabel}
      fields={fields}
      onPick={onPick}
      trigger={trigger}
    />
  );
}

export interface DatabaseMobileToolbarProps {
  databaseId: string;
  fields: readonly DatabaseField[];
  /** Whether the inline chip bar below the title is expanded. */
  filterBarVisible?: boolean;
  onFilterBarVisibleChange?: (visible: boolean) => void;
  view: DatabaseView;
}

/** Funnel + sort icon buttons for the database title row. */
export function DatabaseMobileToolbar({
  databaseId,
  fields,
  filterBarVisible = true,
  onFilterBarVisibleChange,
  view,
}: DatabaseMobileToolbarProps): ReactNode {
  const filterCount = view.filter?.conditions.length ?? 0;
  const sortCount = view.sorts?.length ?? 0;
  const isGrouped = view.groupBy !== undefined;
  const hasFilters = filterCount > 0;
  const hasSortsOrGrouping = sortCount > 0 || isGrouped;
  const sorts = view.sorts ?? [];
  const sortedFieldIds = new Set(sorts.map((sort) => sort.fieldId));
  const sortableFields = fields.filter(
    (field) => !sortedFieldIds.has(field.id)
  );

  const toggleBar = () => {
    onFilterBarVisibleChange?.(!filterBarVisible);
  };

  const expandBar = () => {
    onFilterBarVisibleChange?.(true);
  };

  const handleAddFilter = (field: DatabaseField) => {
    const condition = {
      id: crypto.randomUUID(),
      fieldId: field.id,
      operator: FIELD_TYPE_DEFS[field.type].defaultOperator,
    };
    updateDatabaseView(databaseId, view.id, {
      filter: appendFilterCondition(view.filter, condition),
    });
    expandBar();
  };

  const handleAddSort = (field: DatabaseField) => {
    updateDatabaseView(databaseId, view.id, {
      sorts: [...sorts, { fieldId: field.id, direction: "asc" }],
    });
    expandBar();
  };

  const barAction = filterBarVisible ? "hide" : "show";

  const filterButton = hasFilters ? (
    <ToolbarToggleButton
      active
      icon={<IconFilter aria-hidden />}
      label={`Filters (${filterCount} active), ${barAction} filter and sort bar`}
      onToggle={toggleBar}
      pressed={filterBarVisible}
    />
  ) : (
    <ToolbarFieldDropdownButton
      fields={fields}
      icon={<IconFilter aria-hidden />}
      label="Add filter"
      onPick={handleAddFilter}
    />
  );

  const sortToggleLabel = (() => {
    if (sortCount > 0) {
      return `Sorts (${sortCount} active), ${barAction} filter and sort bar`;
    }
    if (isGrouped) {
      return `Sorts (grouped), ${barAction} filter and sort bar`;
    }
    return `Sorts, ${barAction} filter and sort bar`;
  })();

  const sortButton = hasSortsOrGrouping ? (
    <ToolbarToggleButton
      active
      icon={<IconArrowsSort aria-hidden />}
      label={sortToggleLabel}
      onToggle={toggleBar}
      pressed={filterBarVisible}
    />
  ) : (
    <ToolbarFieldDropdownButton
      emptyLabel="All properties sorted"
      fields={sortableFields}
      icon={<IconArrowsSort aria-hidden />}
      label="Add sort"
      onPick={handleAddSort}
    />
  );

  return (
    <>
      {filterButton}
      {sortButton}
    </>
  );
}
