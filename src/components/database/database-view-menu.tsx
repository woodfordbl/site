import { IconCopy, IconTrash } from "@tabler/icons-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";

import { resolveViewIconDisplay } from "@/components/database/database-view-icons.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group.tsx";
import { InputGroupIconPicker } from "@/components/ui/input-group-icon-picker.tsx";
import {
  MenuIconRenameInput,
  type MenuOpenChangeDetails,
  shouldCancelMenuCloseForIconPicker,
} from "@/components/ui/menu-icon-rename-input.tsx";
import {
  duplicateDatabaseView,
  removeDatabaseView,
  updateDatabaseView,
} from "@/db/queries/database-collection-ops.ts";
import type { DatabaseView } from "@/lib/schemas/database.ts";

/**
 * Keep typing inside menu-embedded inputs from triggering the menu's
 * typeahead/arrow navigation; Escape still propagates so it closes the menu.
 */
function stopMenuKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

function commitViewName(
  databaseId: string,
  view: DatabaseView,
  value: string
): void {
  const trimmed = value.trim();
  if (trimmed !== "" && trimmed !== view.name) {
    updateDatabaseView(databaseId, view.id, { name: trimmed });
  }
}

export interface DatabaseViewRenameFieldProps {
  databaseId: string;
  view: DatabaseView;
}

/**
 * Settings Views-submenu rename row: leading icon picker (custom glyph or
 * type fallback) plus name input. Writes through `updateDatabaseView`.
 */
export function DatabaseViewRenameField({
  databaseId,
  view,
}: DatabaseViewRenameFieldProps): ReactNode {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const fallbackIcon = resolveViewIconDisplay({ ...view, icon: undefined });

  return (
    <InputGroup className="h-8 min-w-0 flex-1">
      <InputGroupIconPicker
        ariaLabel="Change view icon"
        fallbackIcon={fallbackIcon}
        icon={view.icon}
        onOpenChange={setIconPickerOpen}
        onRemove={() => {
          updateDatabaseView(databaseId, view.id, { icon: undefined });
        }}
        onSelect={(icon) => {
          updateDatabaseView(databaseId, view.id, { icon });
        }}
        open={iconPickerOpen}
      />
      <InputGroupInput
        aria-label={`Rename view ${view.name}`}
        autoComplete="off"
        defaultValue={view.name}
        key={view.name}
        onBlur={(event) => {
          commitViewName(databaseId, view, event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          stopMenuKeys(event);
          if (event.key === "Enter") {
            event.preventDefault();
            commitViewName(databaseId, view, event.currentTarget.value);
          }
        }}
      />
    </InputGroup>
  );
}

export interface DatabaseViewEditActionsProps {
  /** Delete guard: the last remaining view can never be removed. */
  canDelete: boolean;
  databaseId: string;
  /** Activates a view after Duplicate (the copy becomes the active view). */
  onViewIdChange?: (viewId: string) => void;
  view: DatabaseView;
}

/** Duplicate + Delete icon buttons shared by the settings Views submenu. */
export function DatabaseViewEditActions({
  canDelete,
  databaseId,
  onViewIdChange,
  view,
}: DatabaseViewEditActionsProps): ReactNode {
  return (
    <>
      <Button
        aria-label={`Duplicate view ${view.name}`}
        onClick={() => {
          const copy = duplicateDatabaseView(databaseId, view.id);
          if (copy) {
            onViewIdChange?.(copy.id);
          }
        }}
        size="icon-xs"
        variant="ghost"
      >
        <IconCopy />
      </Button>
      <Button
        aria-label={`Delete view ${view.name}`}
        disabled={!canDelete}
        onClick={() => {
          removeDatabaseView(databaseId, view.id);
        }}
        size="icon-xs"
        variant="ghost"
      >
        <IconTrash />
      </Button>
    </>
  );
}

export interface DatabaseViewMenuProps {
  /** Delete guard: the last remaining view can never be removed. */
  canDelete: boolean;
  children: ReactNode;
  databaseId: string;
  /** Activates a view after Duplicate. */
  onViewIdChange: (viewId: string) => void;
  view: DatabaseView;
}

/**
 * Right-click menu on a saved-view tab (edit mode): rename + icon, Duplicate,
 * Delete — identical to the settings Views submenu row.
 */
export function DatabaseViewMenu({
  canDelete,
  children,
  databaseId,
  onViewIdChange,
  view,
}: DatabaseViewMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [draftName, setDraftName] = useState(view.name);

  const handleOpenChange = useCallback(
    (nextOpen: boolean, eventDetails?: MenuOpenChangeDetails) => {
      if (
        shouldCancelMenuCloseForIconPicker(
          nextOpen,
          iconPickerOpen,
          eventDetails
        )
      ) {
        return;
      }
      setOpen(nextOpen);
      if (nextOpen) {
        setDraftName(view.name);
      } else {
        setIconPickerOpen(false);
      }
    },
    [iconPickerOpen, view.name]
  );

  const fallbackIcon = resolveViewIconDisplay({ ...view, icon: undefined });

  return (
    <ContextMenu onOpenChange={handleOpenChange} open={open}>
      <ContextMenuTrigger render={children as never} />
      <ContextMenuContent className="w-64">
        <ContextMenuGroup>
          <ContextMenuLabel className="max-w-full">
            <span className="min-w-0 truncate">{view.name}</span>
          </ContextMenuLabel>
        </ContextMenuGroup>
        <MenuIconRenameInput
          ariaLabelIcon="Change view icon"
          ariaLabelName={`Rename view ${view.name}`}
          draftName={draftName}
          fallbackIcon={fallbackIcon}
          icon={view.icon}
          iconPickerOpen={iconPickerOpen}
          onCommit={() => {
            commitViewName(databaseId, view, draftName);
          }}
          onDraftNameChange={setDraftName}
          onIconPickerOpenChange={setIconPickerOpen}
          onIconRemove={() => {
            updateDatabaseView(databaseId, view.id, { icon: undefined });
          }}
          onIconSelect={(icon) => {
            updateDatabaseView(databaseId, view.id, { icon });
          }}
          onSubmit={() => {
            commitViewName(databaseId, view, draftName);
          }}
          placeholder="View name"
        />
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            const copy = duplicateDatabaseView(databaseId, view.id);
            if (copy) {
              onViewIdChange(copy.id);
            }
          }}
        >
          <IconCopy />
          Duplicate view
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canDelete}
          onClick={() => {
            removeDatabaseView(databaseId, view.id);
          }}
          variant="destructive"
        >
          <IconTrash />
          Delete view
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
