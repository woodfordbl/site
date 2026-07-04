import {
  IconArrowDown,
  IconArrowUp,
  IconDatabase,
  IconDots,
  IconEye,
  IconEyeOff,
  IconLayoutList,
  IconListDetails,
  IconTrash,
} from "@tabler/icons-react";
import { format } from "date-fns/format";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { visibleFieldIdsAfterHide } from "@/components/database/database-column-menu-helpers.ts";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import {
  deleteDatabase,
  renameDatabase,
  reorderDatabaseFields,
  updateDatabaseView,
} from "@/db/queries/database-collection-ops.ts";
import type {
  DatabaseField,
  DatabaseView,
  DatabaseViewType,
  LocalDatabase,
} from "@/lib/schemas/database.ts";

/**
 * Database ⋯ settings menu in the title row (edit mode only), following the
 * page header menu conventions: rename-in-place at top, Properties / Views /
 * Source submenus, a two-step destructive Delete, and a non-interactive stats
 * footer. All writes go through the database collection ops.
 */

const VIEW_TYPE_LABELS: Record<DatabaseViewType, string> = {
  table: "Table",
};

/** Timestamps in menu copy: "Jan 5, 2026 3:24 PM". */
function formatTimestamp(iso: string): string {
  return format(new Date(iso), "MMM d, yyyy h:mm a");
}

/**
 * Keep typing inside menu-embedded inputs from triggering the menu's
 * typeahead/arrow navigation; Escape still propagates so it closes the menu.
 */
function stopMenuKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

interface DatabaseRenameInputProps {
  draftName: string;
  onCommit: () => void;
  onDraftNameChange: (name: string) => void;
  onSubmit: () => void;
}

/**
 * Rename input at the top of the menu (same pattern as the column menu
 * rename): mounted only while the menu is open, stealing focus from the popup
 * after Base UI's initial focus pass via a rAF — no inline ref callbacks.
 */
function DatabaseRenameInput({
  draftName,
  onCommit,
  onDraftNameChange,
  onSubmit,
}: DatabaseRenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="p-1 pb-2">
      <InputGroup className="h-8">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <IconDatabase className="stroke-[1.5px]" />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Database name"
          autoComplete="off"
          onBlur={onCommit}
          onChange={(event) => {
            onDraftNameChange(event.target.value);
          }}
          onKeyDown={(event) => {
            stopMenuKeys(event);
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Database name"
          ref={inputRef}
          value={draftName}
        />
      </InputGroup>
    </div>
  );
}

interface PropertyRowProps {
  canMoveDown: boolean;
  canMoveUp: boolean;
  field: DatabaseField;
  isPrimary: boolean;
  isVisible: boolean;
  onMove: (delta: -1 | 1) => void;
  onToggleVisible: () => void;
}

/**
 * One field row in the Properties submenu: field icon (custom glyph or type
 * icon) + name, move up/down, and a hide/show toggle. The primary field shows
 * a "Title" badge and can never be hidden. Tapping the name opens nothing
 * this wave — field editing lives in the column menu.
 */
function PropertyRow({
  canMoveDown,
  canMoveUp,
  field,
  isPrimary,
  isVisible,
  onMove,
  onToggleVisible,
}: PropertyRowProps) {
  const FieldIcon = resolveFieldIcon(field);

  return (
    <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm">
      <FieldIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{field.name}</span>
      {isPrimary ? (
        <span className="shrink-0 rounded-sm bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
          Title
        </span>
      ) : null}
      <Button
        aria-label={`Move ${field.name} up`}
        disabled={!canMoveUp}
        onClick={() => {
          onMove(-1);
        }}
        size="icon-xs"
        variant="ghost"
      >
        <IconArrowUp />
      </Button>
      <Button
        aria-label={`Move ${field.name} down`}
        disabled={!canMoveDown}
        onClick={() => {
          onMove(1);
        }}
        size="icon-xs"
        variant="ghost"
      >
        <IconArrowDown />
      </Button>
      {isPrimary ? null : (
        <Button
          aria-label={isVisible ? `Hide ${field.name}` : `Show ${field.name}`}
          onClick={onToggleVisible}
          size="icon-xs"
          variant="ghost"
        >
          {isVisible ? <IconEye /> : <IconEyeOff />}
        </Button>
      )}
    </div>
  );
}

interface PropertiesSubmenuProps {
  database: LocalDatabase;
}

/**
 * Properties submenu: one row per field in schema order with reorder and
 * hide/show controls. Visibility writes `visibleFieldIds` on the FIRST view
 * only for now — multi-view threading is deferred with linked views.
 */
function PropertiesSubmenu({ database }: PropertiesSubmenuProps) {
  const view = database.views[0];

  const isVisible = (fieldId: string): boolean =>
    !view?.visibleFieldIds || view.visibleFieldIds.includes(fieldId);

  const moveField = (index: number, delta: -1 | 1) => {
    const ids = database.fields.map((field) => field.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) {
      return;
    }
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderDatabaseFields(database.id, ids);
  };

  const toggleVisible = (fieldId: string) => {
    if (!view) {
      return;
    }
    const allFieldIds = database.fields.map((field) => field.id);
    const next = isVisible(fieldId)
      ? visibleFieldIdsAfterHide(view.visibleFieldIds, allFieldIds, fieldId)
      : [...(view.visibleFieldIds ?? []), fieldId];
    updateDatabaseView(database.id, view.id, { visibleFieldIds: next });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconListDetails />
        Properties
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64 min-w-64">
        {database.fields.map((field, index) => (
          <PropertyRow
            canMoveDown={index < database.fields.length - 1}
            canMoveUp={index > 0}
            field={field}
            isPrimary={field.id === database.primaryFieldId}
            isVisible={isVisible(field.id)}
            key={field.id}
            onMove={(delta) => {
              moveField(index, delta);
            }}
            onToggleVisible={() => {
              toggleVisible(field.id);
            }}
          />
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

interface ViewRowProps {
  databaseId: string;
  view: DatabaseView;
}

/** One view row: inline rename input with the view type as a trailing label. */
function ViewRow({ databaseId, view }: ViewRowProps) {
  const commit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== "" && trimmed !== view.name) {
      updateDatabaseView(databaseId, view.id, { name: trimmed });
    }
  };

  return (
    <InputGroup className="h-8">
      <InputGroupInput
        aria-label={`Rename view ${view.name}`}
        autoComplete="off"
        defaultValue={view.name}
        onBlur={(event) => {
          commit(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          stopMenuKeys(event);
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget.value);
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{VIEW_TYPE_LABELS[view.type]}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}

interface ViewsSubmenuProps {
  database: LocalDatabase;
}

/**
 * Views submenu: the database's saved views with inline rename and the view
 * type label. "Add view" and per-view style pickers are Phase 2 (multi-view
 * switching / linked-view threading) — intentionally omitted here.
 */
function ViewsSubmenu({ database }: ViewsSubmenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconLayoutList />
        Views
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <div className="flex flex-col gap-1 p-1">
          {database.views.map((view) => (
            <ViewRow databaseId={database.id} key={view.id} view={view} />
          ))}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-right text-foreground tabular-nums">
        {value}
      </span>
    </div>
  );
}

interface SourceSubmenuProps {
  database: LocalDatabase;
  rowCount: number;
}

/**
 * Source submenu — read-only for now: the local storage backing (shard key),
 * row count, and timestamps. Connector sources will surface here in a later
 * phase.
 */
function SourceSubmenu({ database, rowCount }: SourceSubmenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconDatabase />
        Source
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <div className="space-y-1.5 px-2 py-2">
          <InfoRow label="Source" value="Local database" />
          <InfoRow label="Rows" value={String(rowCount)} />
          <InfoRow
            label="Created"
            value={formatTimestamp(database.createdAt)}
          />
          <InfoRow
            label="Updated"
            value={formatTimestamp(database.updatedAt)}
          />
        </div>
        <DropdownMenuSeparator />
        <div className="px-2 py-2 text-xs">
          <span className="text-muted-foreground">Storage key</span>
          <p className="mt-0.5 break-all font-mono text-[11px] text-foreground">
            {`site-local-db-rows:${database.id}`}
          </p>
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground tabular-nums">{value}</span>
    </div>
  );
}

export interface DatabaseSettingsMenuProps {
  database: LocalDatabase;
  /** Whether the hosting block currently hides the title row text. */
  hideTitle?: boolean;
  /**
   * Toggles the block's `hideTitle` prop. When absent (no block context to
   * write to) the "Hide title" switch row is not rendered.
   */
  onHideTitleChange?: (hideTitle: boolean) => void;
  /** Total (unfiltered) row count — stats footer and Source section. */
  rowCount: number;
}

/**
 * The ⋯ trigger + dropdown for one database, mounted in the title row in edit
 * mode. The trigger reveals on title-row hover/focus on fine pointers and
 * stays visible on coarse pointers (`.hover-reveal` under the title's
 * `data-reveal-group`). Deleting only removes the database entity — blocks
 * are references and fall back to their "not found" empty state.
 */
export function DatabaseSettingsMenu({
  database,
  hideTitle = false,
  onHideTitleChange,
  rowCount,
}: DatabaseSettingsMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(database.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const commitRename = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed !== "" && trimmed !== database.name) {
      renameDatabase(database.id, trimmed);
    }
  }, [database.id, database.name, draftName]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setDraftName(database.name);
        setConfirmingDelete(false);
      } else {
        // Closing commits a pending rename (covers outside click / Escape).
        commitRename();
      }
      setOpen(nextOpen);
    },
    [commitRename, database.name]
  );

  const handleDeleteClick = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    deleteDatabase(database.id);
    setOpen(false);
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange} open={open}>
      <DropdownMenuTrigger
        nativeButton
        render={
          <Button
            aria-label="Database settings and actions"
            className="hover-reveal shrink-0 self-center text-muted-foreground data-popup-open:opacity-100"
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconDots aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 min-w-64">
        <DatabaseRenameInput
          draftName={draftName}
          onCommit={commitRename}
          onDraftNameChange={setDraftName}
          onSubmit={() => {
            commitRename();
            setOpen(false);
          }}
        />
        <DropdownMenuSeparator />
        <PropertiesSubmenu database={database} />
        <ViewsSubmenu database={database} />
        {onHideTitleChange ? (
          <DropdownMenuSwitchItem
            checked={hideTitle}
            onCheckedChange={onHideTitleChange}
          >
            <IconEyeOff />
            Hide title
          </DropdownMenuSwitchItem>
        ) : null}
        <DropdownMenuSeparator />
        <SourceSubmenu database={database} rowCount={rowCount} />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          closeOnClick={false}
          onClick={handleDeleteClick}
          variant="destructive"
        >
          <IconTrash />
          {confirmingDelete ? "Confirm delete…" : "Delete database"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="space-y-1.5 px-2 py-2">
          <StatRow label="Fields" value={String(database.fields.length)} />
          <StatRow label="Rows" value={String(rowCount)} />
          <StatRow
            label="Created at"
            value={formatTimestamp(database.createdAt)}
          />
          <StatRow
            label="Last edited at"
            value={formatTimestamp(database.updatedAt)}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
