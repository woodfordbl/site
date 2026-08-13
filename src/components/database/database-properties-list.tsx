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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  removeDatabaseField,
  reorderDatabaseFields,
} from "@/db/queries/database-collection-ops.ts";
import type { DatabaseField, LocalDatabase } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Reorderable Properties list used by the row-page Properties ⋯ menu (the
 * database ⋯ settings Properties submenu shares the grip, lock tooltip, and
 * primary-pin helpers). Visibility is injected by the host so table views
 * keep writing `view.visibleFieldIds` while row pages write
 * `rowPropertiesVisibleFieldIds`.
 */

/** Hover copy on the primary field — it cannot be hidden, deleted, or reordered. */
export const TITLE_PROPERTY_LOCKED_HINT =
  "Title properties cannot be hidden or removed";

/**
 * Commits a Properties-list reorder while pinning the primary field at index
 * 0. The title is the row-page heading, so it always stays on top; dragging
 * it is not offered in the UI. Returns `null` when the move is a no-op or
 * would drag the primary field.
 */
export function fieldIdsAfterReorderPinningPrimary(
  fieldIds: readonly string[],
  primaryFieldId: string,
  from: number,
  to: number
): string[] | null {
  if (from === to || fieldIds[from] === primaryFieldId) {
    return null;
  }
  const ids = [...fieldIds];
  const [moved] = ids.splice(from, 1);
  if (moved === undefined) {
    return null;
  }
  ids.splice(to, 0, moved);
  return [primaryFieldId, ...ids.filter((id) => id !== primaryFieldId)];
}

/**
 * Left-column grip for a Properties row, or a same-size spacer when the
 * field is primary (title stays first; it has nothing to reorder against).
 */
export function DatabasePropertyReorderHandle({
  fieldName,
  handleProps,
}: {
  fieldName: string;
  handleProps: ListReorderHandleProps | null;
}): ReactNode {
  if (!handleProps) {
    return <span aria-hidden className="size-7 shrink-0" />;
  }
  return (
    <button
      aria-label={`Reorder ${fieldName}`}
      className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing"
      data-vaul-no-drag=""
      type="button"
      {...handleProps}
    >
      <IconGripVertical className="size-4 stroke-[1.5px]" />
    </button>
  );
}

/** Tooltip around the primary field's name + Title badge. */
export function TitlePropertyLockTooltip({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
            {children}
          </span>
        }
      />
      <TooltipContent>{TITLE_PROPERTY_LOCKED_HINT}</TooltipContent>
    </Tooltip>
  );
}

function TitlePropertyBadge(): ReactNode {
  return (
    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      Title
    </span>
  );
}

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
  /** Pointer handlers for the left grip; omitted on the primary field. */
  reorderHandleProps: ListReorderHandleProps | null;
}

/**
 * One field row in the Properties list: a left grip that drag-reorders the
 * schema (spacer on the primary field — title stays first on the page), the
 * field icon + name, a "Title" badge beside the primary field's name, and —
 * for non-primary fields — hide/show and delete controls on the right. The
 * primary field can never be hidden, deleted, or reordered; hovering its
 * name explains why.
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
  const name = (
    <>
      <span className="min-w-0 truncate">{field.name}</span>
      {isPrimary ? <TitlePropertyBadge /> : null}
    </>
  );

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
      <DatabasePropertyReorderHandle
        fieldName={field.name}
        handleProps={reorderHandleProps}
      />
      <FieldIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {isPrimary ? (
          <TitlePropertyLockTooltip>{name}</TitlePropertyLockTooltip>
        ) : (
          name
        )}
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
 * grip / eye / trash on non-primary fields. The primary (title) field stays
 * first, has no grip or hide/delete, and explains the lock on hover.
 */
export function DatabasePropertiesList({
  database,
  isVisible,
  onToggleVisible,
}: DatabasePropertiesListProps): ReactNode {
  const reorderFields = (from: number, to: number) => {
    const next = fieldIdsAfterReorderPinningPrimary(
      database.fields.map((field) => field.id),
      database.primaryFieldId,
      from,
      to
    );
    if (!next) {
      return;
    }
    reorderDatabaseFields(database.id, next);
  };

  const { containerRef, getHandleProps, state } = useListReorder(reorderFields);

  const lastIndex = database.fields.length - 1;
  const isReordering = state.fromIndex !== null;

  return (
    <div ref={containerRef}>
      {database.fields.map((field, index) => {
        const isPrimary = field.id === database.primaryFieldId;
        return (
          <DatabasePropertyRow
            dropAfter={
              isReordering &&
              index === lastIndex &&
              state.overIndex === index + 1
            }
            dropBefore={isReordering && !isPrimary && state.overIndex === index}
            field={field}
            isDragging={state.fromIndex === index}
            isPrimary={isPrimary}
            isVisible={isVisible(field.id)}
            key={field.id}
            onDelete={() => {
              removeDatabaseField(database.id, field.id);
            }}
            onToggleVisible={() => {
              onToggleVisible(field.id);
            }}
            reorderHandleProps={isPrimary ? null : getHandleProps(index)}
          />
        );
      })}
    </div>
  );
}
