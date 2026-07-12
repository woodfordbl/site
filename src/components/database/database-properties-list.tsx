import {
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconTrash,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import {
  type ListReorderHandleProps,
  useListReorder,
} from "@/components/database/use-list-reorder.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  removeDatabaseField,
  reorderDatabaseFields,
} from "@/db/queries/database-collection-ops.ts";
import type { DatabaseField, LocalDatabase } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Shared Properties list used by the database ⋯ settings Properties submenu
 * and the row-page Properties ⋯ menu: schema reorder (grip), hide/show, and
 * delete. Visibility is injected by the host so table views keep writing
 * `view.visibleFieldIds` while row pages write `rowPropertiesVisibleFieldIds`.
 */

interface DatabasePropertyRowProps {
  /** Drop-line below the last row while a row is dragged past the end. */
  dropAfter: boolean;
  /** Drop-line above this row while another row is dragged over its top slot. */
  dropBefore: boolean;
  field: DatabaseField;
  /** Dim the row while it is the one being dragged. */
  isDragging: boolean;
  isPrimary: boolean;
  isVisible: boolean;
  onDelete: () => void;
  onToggleVisible: () => void;
  /** Pointer handlers for the left grip; drives {@link useListReorder}. */
  reorderHandleProps: ListReorderHandleProps;
}

/**
 * One field row in the Properties list: a left grip that drag-reorders the
 * schema, the field icon + name, a "Title" badge beside the primary field's
 * name, and — for non-primary fields — hide/show and delete controls on the
 * right. The primary field can never be hidden or deleted. Tapping the name
 * opens nothing here — field editing lives in the column menu.
 */
function DatabasePropertyRow({
  dropBefore,
  dropAfter,
  field,
  isDragging,
  isPrimary,
  isVisible,
  reorderHandleProps,
  onDelete,
  onToggleVisible,
}: DatabasePropertyRowProps) {
  const FieldIcon = resolveFieldIcon(field);

  return (
    <div
      className={cn(
        "relative flex min-h-8 pointer-coarse:min-h-11 items-center gap-1 rounded-md pr-1 pl-0.5 text-sm",
        isDragging && "opacity-40"
      )}
      data-menu-card-item=""
      data-reorder-item=""
    >
      {dropBefore ? <PropertyDropLine position="top" /> : null}
      {dropAfter ? <PropertyDropLine position="bottom" /> : null}
      <button
        aria-label={`Reorder ${field.name}`}
        className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing"
        data-vaul-no-drag=""
        type="button"
        {...reorderHandleProps}
      >
        <IconGripVertical className="size-4 stroke-[1.5px]" />
      </button>
      <FieldIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 truncate">{field.name}</span>
        {isPrimary ? (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            Title
          </span>
        ) : null}
      </div>
      {isPrimary ? null : (
        <>
          <Button
            aria-label={isVisible ? `Hide ${field.name}` : `Show ${field.name}`}
            onClick={onToggleVisible}
            size="icon-xs"
            variant="ghost"
          >
            {isVisible ? <IconEye /> : <IconEyeOff />}
          </Button>
          <Button
            aria-label={`Delete ${field.name}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            size="icon-xs"
            variant="ghost"
          >
            <IconTrash />
          </Button>
        </>
      )}
    </div>
  );
}

/** Full-width reorder drop indicator, pinned to a row's top or bottom edge. */
function PropertyDropLine({ position }: { position: "top" | "bottom" }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-selection-primary",
        position === "top" ? "top-0" : "bottom-0 translate-y-1/2"
      )}
    />
  );
}

export interface DatabasePropertiesListProps {
  database: LocalDatabase;
  /** Whether the given field id is currently shown on this surface. */
  isVisible: (fieldId: string) => boolean;
  /** Toggle hide/show for a non-primary field. */
  onToggleVisible: (fieldId: string) => void;
}

/**
 * Reorderable Properties list for a database: one row per schema field with
 * grip / eye / trash. Visibility callbacks are host-owned.
 */
export function DatabasePropertiesList({
  database,
  isVisible,
  onToggleVisible,
}: DatabasePropertiesListProps): ReactNode {
  const reorderFields = (from: number, to: number) => {
    const ids = database.fields.map((field) => field.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    reorderDatabaseFields(database.id, ids);
  };

  const { containerRef, getHandleProps, state } = useListReorder(reorderFields);

  const lastIndex = database.fields.length - 1;
  const isReordering = state.fromIndex !== null;

  return (
    <div ref={containerRef}>
      {database.fields.map((field, index) => (
        <DatabasePropertyRow
          dropAfter={
            isReordering && index === lastIndex && state.overIndex === index + 1
          }
          dropBefore={isReordering && state.overIndex === index}
          field={field}
          isDragging={state.fromIndex === index}
          isPrimary={field.id === database.primaryFieldId}
          isVisible={isVisible(field.id)}
          key={field.id}
          onDelete={() => {
            removeDatabaseField(database.id, field.id);
          }}
          onToggleVisible={() => {
            onToggleVisible(field.id);
          }}
          reorderHandleProps={getHandleProps(index)}
        />
      ))}
    </div>
  );
}
