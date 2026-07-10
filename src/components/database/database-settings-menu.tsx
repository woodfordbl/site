import {
  IconChartBar,
  IconCheck,
  IconCheckbox,
  IconClock,
  IconColumns3,
  IconCopy,
  IconDatabase,
  IconDots,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconGripVertical,
  IconLayoutGrid,
  IconLayoutKanban,
  IconLayoutList,
  IconListDetails,
  IconRefresh,
  IconTrash,
  IconX,
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

import { ConnectorIcon } from "@/components/database/connector-icon.tsx";
import { DatabasePropertyEditItems } from "@/components/database/database-column-menu.tsx";
import { visibleFieldIdsAfterHide } from "@/components/database/database-column-menu-helpers.ts";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { resolveRowSelectDisplay } from "@/components/database/database-grid-helpers.ts";
import {
  AddDatabaseViewMenuItems,
  DATABASE_VIEW_TYPE_ICONS,
} from "@/components/database/database-view-switcher.tsx";
import {
  type ListReorderHandleProps,
  useListReorder,
} from "@/components/database/use-list-reorder.ts";
import { BoardOptionsItems } from "@/components/database/views/database-board-config.tsx";
import { ChartOptionsItems } from "@/components/database/views/database-chart-config.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  deleteDatabase,
  duplicateDatabaseView,
  removeDatabaseField,
  removeDatabaseView,
  renameDatabase,
  reorderDatabaseFields,
  updateDatabaseSource,
  updateDatabaseView,
} from "@/db/queries/database-collection-ops.ts";
import { requestImmediateSync } from "@/db/sync/database-sync-engine.ts";
import { useSyncStatus } from "@/hooks/use-sync-status.ts";
import { getConnector } from "@/lib/connectors/registry.ts";
import {
  getConnectorToken,
  setConnectorToken,
} from "@/lib/connectors/token-store.ts";
import type {
  ConnectorAuthSpec,
  ConnectorConfigField,
  ConnectorConfigOption,
} from "@/lib/connectors/types.ts";
import type { ChartData } from "@/lib/databases/chart-data.ts";
import { isGroupableField } from "@/lib/databases/row-group.ts";
import type {
  DatabaseField,
  DatabaseSource,
  DatabaseView,
  LocalDatabase,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Database ⋯ settings menu in the title row (edit mode only), following the
 * page header menu conventions: rename-in-place at top, Properties / Views /
 * Source submenus, a two-step destructive Delete, and a non-interactive stats
 * footer. All writes go through the database collection ops. Per-view
 * sections (Properties visibility, Group, Vertical separators) scope to the
 * ACTIVE view threaded from the title row — never `views[0]`.
 */

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
      <InputGroup className="h-8 pointer-coarse:h-10">
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
  databaseId: string;
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
  /** Closes the whole settings menu (rename Enter, formula editor Save). */
  onRequestClose: () => void;
  onToggleVisible: () => void;
  /** Pointer handlers for the left grip; drives {@link useListReorder}. */
  reorderHandleProps: ListReorderHandleProps;
}

/**
 * One field row in the Properties list: a left grip that drag-reorders the
 * schema, then the field name as a per-field edit submenu trigger (rename,
 * per-type config, change type — the same editing core as the column
 * menu), a "Title" badge beside the primary field's name, and — for
 * non-primary fields — hide/show and delete controls on the right. The
 * primary field can never be hidden or deleted.
 */
function PropertyRow({
  databaseId,
  dropBefore,
  dropAfter,
  field,
  isDragging,
  isPrimary,
  isVisible,
  onRequestClose,
  reorderHandleProps,
  onDelete,
  onToggleVisible,
}: PropertyRowProps) {
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
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          aria-label={`Edit ${field.name}`}
          className="min-h-7 pointer-coarse:min-h-10 min-w-0 flex-1 gap-1.5 px-1"
        >
          <FieldIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
          <span className="min-w-0 truncate">{field.name}</span>
          {isPrimary ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              Title
            </span>
          ) : null}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-64 min-w-64">
          <DatabasePropertyEditItems
            databaseId={databaseId}
            field={field}
            onRequestClose={onRequestClose}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
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

interface PropertiesSubmenuProps {
  database: LocalDatabase;
  /** Closes the whole settings menu (threaded into each row's edit submenu). */
  onRequestClose: () => void;
  /** The active view — field visibility is a per-view setting. */
  view: DatabaseView;
}

/**
 * Properties submenu: one row per field in schema order with a drag grip, a
 * per-field edit submenu (rename / per-type config / change type), hide/show,
 * and delete. Visibility writes `visibleFieldIds` on the ACTIVE view; reorder
 * and field edits rewrite the schema (all views).
 */
function PropertiesSubmenu({
  database,
  onRequestClose,
  view,
}: PropertiesSubmenuProps) {
  const isVisible = (fieldId: string): boolean =>
    !view.visibleFieldIds || view.visibleFieldIds.includes(fieldId);

  const reorderFields = (from: number, to: number) => {
    const ids = database.fields.map((field) => field.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    reorderDatabaseFields(database.id, ids);
  };

  const { containerRef, getHandleProps, state } = useListReorder(reorderFields);

  const toggleVisible = (fieldId: string) => {
    const allFieldIds = database.fields.map((field) => field.id);
    const next = isVisible(fieldId)
      ? visibleFieldIdsAfterHide(view.visibleFieldIds, allFieldIds, fieldId)
      : [...(view.visibleFieldIds ?? []), fieldId];
    updateDatabaseView(database.id, view.id, { visibleFieldIds: next });
  };

  const lastIndex = database.fields.length - 1;
  const isReordering = state.fromIndex !== null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconListDetails />
        Properties
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64 min-w-64">
        <div ref={containerRef}>
          {database.fields.map((field, index) => (
            <PropertyRow
              databaseId={database.id}
              dropAfter={
                isReordering &&
                index === lastIndex &&
                state.overIndex === index + 1
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
              onRequestClose={onRequestClose}
              onToggleVisible={() => {
                toggleVisible(field.id);
              }}
              reorderHandleProps={getHandleProps(index)}
            />
          ))}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

interface GroupSubmenuProps {
  database: LocalDatabase;
  /** The active view — grouping is a per-view setting. */
  view: DatabaseView;
}

/**
 * Group submenu: "None" plus every groupable field (formula fields are
 * excluded — no stable stored bucket key). Picking a field groups the ACTIVE
 * view and resets the collapse state; re-picking the active field is a no-op
 * so collapsed groups survive an accidental click.
 */
function GroupSubmenu({ database, view }: GroupSubmenuProps) {
  const activeFieldId = view.groupBy?.fieldId;
  const groupableFields = database.fields.filter(isGroupableField);
  // Groups hidden via the group header context menu — recoverable here even
  // when every group is hidden (no header left to right-click).
  const hiddenGroupCount = view.config.hiddenGroupKeys?.length ?? 0;

  const showHiddenGroups = () => {
    updateDatabaseView(database.id, view.id, {
      config: { ...view.config, hiddenGroupKeys: undefined },
    });
  };

  const writeGroupBy = (fieldId: string | null) => {
    if (fieldId === activeFieldId || (fieldId === null && !activeFieldId)) {
      return;
    }
    // Collapse AND hidden state reset together — both store bucket keys of
    // the previous field, which can collide with the new field's buckets
    // (`""` empty, checkbox `true`/`false`, plain text/number values).
    updateDatabaseView(database.id, view.id, {
      groupBy: fieldId === null ? undefined : { fieldId },
      config: {
        ...view.config,
        collapsedGroupKeys: undefined,
        hiddenGroupKeys: undefined,
      },
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconLayoutGrid />
        Group
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem
          onClick={() => {
            writeGroupBy(null);
          }}
        >
          None
          {activeFieldId === undefined ? (
            <IconCheck className="ml-auto shrink-0" />
          ) : null}
        </DropdownMenuItem>
        {groupableFields.map((field) => {
          const FieldIcon = resolveFieldIcon(field);
          return (
            <DropdownMenuItem
              key={field.id}
              onClick={() => {
                writeGroupBy(field.id);
              }}
            >
              <FieldIcon className="stroke-[1.5px]" />
              <span className="min-w-0 flex-1 truncate">{field.name}</span>
              {activeFieldId === field.id ? (
                <IconCheck className="ml-auto shrink-0" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {hiddenGroupCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={showHiddenGroups}>
              <IconEye />
              Show {hiddenGroupCount} hidden{" "}
              {hiddenGroupCount === 1 ? "group" : "groups"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Table-only: leading row-select gutter/column display mode. */
function RowSelectDisplaySubmenu({
  databaseId,
  view,
}: {
  databaseId: string;
  view: DatabaseView;
}) {
  const active = resolveRowSelectDisplay(view.config);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconCheckbox />
        Row select
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            updateDatabaseView(databaseId, view.id, {
              config: {
                ...view.config,
                rowSelectDisplay:
                  value === "hover" ? undefined : (value as typeof active),
              },
            });
          }}
          value={active}
        >
          <DropdownMenuRadioItem value="always">
            Always show
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="hover">
            Show on hover
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="number">
            Show number
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

interface ViewRowProps {
  /** Delete guard: the last remaining view can never be removed. */
  canDelete: boolean;
  databaseId: string;
  /** Activates a view after Duplicate (the copy becomes the active view). */
  onViewIdChange?: (viewId: string) => void;
  view: DatabaseView;
}

/**
 * One view row: type icon, inline rename input, and Duplicate / Delete
 * actions. Delete is disabled on the last view (`removeDatabaseView` also
 * refuses at the op level); Duplicate switches the block to the copy.
 */
function ViewRow({
  canDelete,
  databaseId,
  onViewIdChange,
  view,
}: ViewRowProps) {
  const TypeIcon = DATABASE_VIEW_TYPE_ICONS[view.type];

  const commit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== "" && trimmed !== view.name) {
      updateDatabaseView(databaseId, view.id, { name: trimmed });
    }
  };

  return (
    <div className="flex items-center gap-1">
      <InputGroup className="h-8 min-w-0 flex-1">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <TypeIcon className="stroke-[1.5px]" />
          </InputGroupText>
        </InputGroupAddon>
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
      </InputGroup>
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
    </div>
  );
}

interface ViewsSubmenuProps {
  database: LocalDatabase;
  /** Activates a view (Add view / Duplicate switch the block to it). */
  onViewIdChange?: (viewId: string) => void;
}

/**
 * Views submenu: the database's saved views with inline rename, per-view
 * Duplicate / Delete (guarded to keep at least one view), and the Add view
 * entries mirroring the title-row switcher's "+".
 */
function ViewsSubmenu({ database, onViewIdChange }: ViewsSubmenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconLayoutList />
        Views
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64 min-w-64">
        <div className="flex flex-col gap-1 p-1">
          {database.views.map((view) => (
            <ViewRow
              canDelete={database.views.length > 1}
              databaseId={database.id}
              key={view.id}
              onViewIdChange={onViewIdChange}
              view={view}
            />
          ))}
        </div>
        <DropdownMenuSeparator />
        <AddDatabaseViewMenuItems
          databaseId={database.id}
          onCreated={onViewIdChange}
        />
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

/** Refresh-interval presets offered in the Source submenu. */
const REFRESH_INTERVAL_OPTIONS: { label: string; ms: number }[] = [
  { label: "1 minute", ms: 60_000 },
  { label: "5 minutes", ms: 300_000 },
  { label: "15 minutes", ms: 900_000 },
  { label: "1 hour", ms: 3_600_000 },
  { label: "6 hours", ms: 21_600_000 },
];

/** Radio value marking "no override — use the connector's default cadence". */
const REFRESH_INTERVAL_DEFAULT_VALUE = "default";

interface RefreshIntervalSubmenuProps {
  databaseId: string;
  refreshMs: number | undefined;
}

/**
 * Poll-interval override picker. "Default" clears `source.refreshMs`; any
 * preset writes it. Connectors clamp overrides to their own minimum, so an
 * aggressive pick may effectively poll slower than labeled.
 */
function RefreshIntervalSubmenu({
  databaseId,
  refreshMs,
}: RefreshIntervalSubmenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconClock />
        Refresh interval
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            updateDatabaseSource(databaseId, {
              refreshMs:
                value === REFRESH_INTERVAL_DEFAULT_VALUE
                  ? undefined
                  : Number(value),
            });
          }}
          value={String(refreshMs ?? REFRESH_INTERVAL_DEFAULT_VALUE)}
        >
          <DropdownMenuRadioItem value={REFRESH_INTERVAL_DEFAULT_VALUE}>
            Default
          </DropdownMenuRadioItem>
          {REFRESH_INTERVAL_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.ms} value={String(option.ms)}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          Sources enforce a minimum interval.
        </p>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

interface ConnectorTokenRowProps {
  auth: ConnectorAuthSpec;
  connectorId: string;
}

/**
 * Masked token input for connectors with BYO-token auth. Commits to the
 * client-only token store on Enter or on blur when the draft changed; an
 * explicitly committed empty value clears the token. Escape CANCELS: the
 * draft reverts to the stored token before the key propagates to close the
 * menu, so the close-triggered blur commits nothing.
 */
function ConnectorTokenRow({ auth, connectorId }: ConnectorTokenRowProps) {
  const storedToken = () => getConnectorToken(connectorId) ?? "";
  const commit = (value: string) => {
    // Dirty-check so dismissal blurs of an untouched (or reverted) draft
    // never rewrite — or delete — the working stored token.
    if (value !== storedToken()) {
      setConnectorToken(connectorId, value);
    }
  };

  return (
    <div className="px-2 py-2">
      <span className="text-muted-foreground text-xs">{auth.label}</span>
      <InputGroup className="mt-1 h-8 pointer-coarse:h-10">
        <InputGroupInput
          aria-label={auth.label}
          autoComplete="off"
          defaultValue={getConnectorToken(connectorId) ?? ""}
          onBlur={(event) => {
            commit(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // Cancel: revert the draft, then let Escape propagate
              // (stopMenuKeys convention) so the menu closes without saving.
              event.currentTarget.value = storedToken();
              return;
            }
            stopMenuKeys(event);
            if (event.key === "Enter") {
              event.preventDefault();
              commit(event.currentTarget.value);
            }
          }}
          placeholder="Paste token…"
          type="password"
        />
      </InputGroup>
      <p className="mt-1 text-muted-foreground text-xs">
        Token saved locally — it never leaves this browser.
      </p>
    </div>
  );
}

/** Max instruments per synced source — matches the Finnhub proxy's peer cap. */
const MAX_CONNECTOR_SYMBOLS = 30;
/** Provider symbol shape once uppercased: A–Z 0–9 . : _ - up to 20 chars. */
const CONNECTOR_SYMBOL_PATTERN = /^[A-Z0-9.:_-]{1,20}$/;
/** Splits pasted/typed input into candidate symbols on commas or newlines. */
const SYMBOL_INPUT_SEPARATOR = /[\n,]/;

interface SymbolListEditorProps {
  config: Record<string, unknown>;
  configKey: string;
  databaseId: string;
  label: string;
  placeholder?: string;
  values: string[];
}

/**
 * Editor for a `list` config field (symbol/ticker set): removable chips plus an
 * add input. Every mutation writes the full config back through
 * `updateDatabaseSource`; the sync engine's collection watcher then refetches
 * and reopens the live socket against the new set (database-sync-engine.ts).
 * Enforces the provider caps (≤ {@link MAX_CONNECTOR_SYMBOLS}, symbol shape) so
 * the next poll can't fail config validation, and blocks removing the last one
 * (connectors require ≥ 1).
 */
function SymbolListEditor({
  config,
  configKey,
  databaseId,
  label,
  placeholder,
  values,
}: SymbolListEditorProps) {
  const [error, setError] = useState("");

  const write = (next: string[]) => {
    updateDatabaseSource(databaseId, {
      config: { ...config, [configKey]: next },
    });
  };

  // Returns true when the input produced at least one new symbol (so the caller
  // can clear the field); sets an inline note for anything skipped.
  const addFromInput = (text: string): boolean => {
    const parsed = text
      .split(SYMBOL_INPUT_SEPARATOR)
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);
    const next = [...values];
    const skipped: string[] = [];
    for (const symbol of parsed) {
      if (next.includes(symbol)) {
        continue;
      }
      if (
        next.length >= MAX_CONNECTOR_SYMBOLS ||
        !CONNECTOR_SYMBOL_PATTERN.test(symbol)
      ) {
        skipped.push(symbol);
        continue;
      }
      next.push(symbol);
    }
    setError(skipped.length > 0 ? `Skipped ${skipped.join(", ")}` : "");
    if (next.length !== values.length) {
      write(next);
      return true;
    }
    return false;
  };

  const remove = (symbol: string) => {
    if (values.length <= 1) {
      setError("Keep at least one");
      return;
    }
    setError("");
    write(values.filter((value) => value !== symbol));
  };

  return (
    <div className="space-y-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {values.map((symbol) => (
            <span
              className="inline-flex items-center gap-1 rounded bg-muted py-0.5 pr-1 pl-1.5 text-foreground text-xs tabular-nums"
              key={symbol}
            >
              {symbol}
              <button
                aria-label={`Remove ${symbol}`}
                className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={values.length <= 1}
                onClick={() => remove(symbol)}
                type="button"
              >
                <IconX className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <InputGroup className="h-8 pointer-coarse:h-10">
        <InputGroupInput
          aria-label={`Add to ${label}`}
          autoComplete="off"
          onBlur={(event) => {
            if (addFromInput(event.currentTarget.value)) {
              event.currentTarget.value = "";
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.value = "";
              return;
            }
            stopMenuKeys(event);
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              if (addFromInput(event.currentTarget.value)) {
                event.currentTarget.value = "";
              }
            }
          }}
          placeholder={placeholder ?? "Add…"}
        />
      </InputGroup>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

interface ConnectorTextConfigRowProps {
  config: Record<string, unknown>;
  configKey: string;
  databaseId: string;
  label: string;
  placeholder?: string;
  value: string;
}

/**
 * Editor for a `text` config field (e.g. a repo owner). Commits the trimmed
 * value on Enter or on blur when it changed; Escape reverts the draft. Same
 * dirty-check / `stopMenuKeys` conventions as {@link ConnectorTokenRow}.
 */
function ConnectorTextConfigRow({
  config,
  configKey,
  databaseId,
  label,
  placeholder,
  value,
}: ConnectorTextConfigRowProps) {
  const commit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed !== value) {
      updateDatabaseSource(databaseId, {
        config: { ...config, [configKey]: trimmed },
      });
    }
  };

  return (
    <div className="space-y-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <InputGroup className="h-8 pointer-coarse:h-10">
        <InputGroupInput
          aria-label={label}
          autoComplete="off"
          defaultValue={value}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.value = value;
              return;
            }
            stopMenuKeys(event);
            if (event.key === "Enter") {
              event.preventDefault();
              commit(event.currentTarget.value);
            }
          }}
          placeholder={placeholder}
        />
      </InputGroup>
    </div>
  );
}

interface ConnectorSelectConfigRowProps {
  config: Record<string, unknown>;
  configKey: string;
  databaseId: string;
  label: string;
  options: ConnectorConfigOption[];
  value: string;
}

/**
 * Editor for an editable `select` config field (e.g. display currency).
 * Writes the picked value straight through `updateDatabaseSource`, same
 * dirty-check convention as {@link ConnectorTextConfigRow}.
 */
function ConnectorSelectConfigRow({
  config,
  configKey,
  databaseId,
  label,
  options,
  value,
}: ConnectorSelectConfigRowProps) {
  return (
    <div className="space-y-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Select
        onValueChange={(next) => {
          if (typeof next === "string" && next !== value) {
            updateDatabaseSource(databaseId, {
              config: { ...config, [configKey]: next },
            });
          }
        }}
        value={value}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue>
            {(current) =>
              options.find((option) => option.value === current)?.label ??
              String(current ?? "")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ConnectorConfigEditorProps {
  config: Record<string, unknown>;
  databaseId: string;
  field: ConnectorConfigField;
}

/**
 * Live editor for one connector config field, replacing the old read-only
 * summary so a synced source's instruments can change after creation. `list`
 * fields get chips; editable `select` fields a dropdown; `creationOnly`
 * fields (e.g. asset type — schema-locked at create) show read-only; `text`
 * fields a single input.
 */
function ConnectorConfigEditor({
  config,
  databaseId,
  field,
}: ConnectorConfigEditorProps) {
  if (field.kind === "list") {
    const raw = config[field.key];
    return (
      <SymbolListEditor
        config={config}
        configKey={field.key}
        databaseId={databaseId}
        label={field.label}
        placeholder={field.placeholder}
        values={Array.isArray(raw) ? raw.map(String) : []}
      />
    );
  }
  if (field.kind === "select") {
    const options = field.options ?? [];
    const value = String(config[field.key] ?? field.defaultValue ?? "");
    const currentLabel =
      options.find((option) => option.value === value)?.label ?? value;
    if (field.creationOnly) {
      return <InfoRow label={field.label} value={currentLabel} />;
    }
    return (
      <ConnectorSelectConfigRow
        config={config}
        configKey={field.key}
        databaseId={databaseId}
        label={field.label}
        options={options}
        value={value}
      />
    );
  }
  return (
    <ConnectorTextConfigRow
      config={config}
      configKey={field.key}
      databaseId={databaseId}
      label={field.label}
      placeholder={field.placeholder}
      value={String(config[field.key] ?? "")}
    />
  );
}

interface ConnectorSourceSubmenuProps {
  database: LocalDatabase;
  rowCount: number;
  source: Extract<DatabaseSource, { kind: "connector" }>;
}

/**
 * Source submenu for a connector-synced database: connector identity, the
 * config summary (labels from `configFields`), last sync / last error from
 * the live engine status, Refresh now, the refresh-interval override, and the
 * token row for connectors with auth.
 */
function ConnectorSourceSubmenu({
  database,
  rowCount,
  source,
}: ConnectorSourceSubmenuProps) {
  const connector = getConnector(source.connectorId);
  const status = useSyncStatus(database.id);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconDatabase />
        Source
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72 min-w-72">
        <div className="space-y-1.5 px-2 py-2">
          <div className="flex items-center gap-1.5 pb-0.5 text-sm">
            <ConnectorIcon
              className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground"
              icon={connector?.icon}
            />
            <span className="min-w-0 truncate">
              {connector?.title ?? "Unknown connector"}
            </span>
          </div>
          {(connector?.configFields ?? []).map((configField) => (
            <ConnectorConfigEditor
              config={source.config}
              databaseId={database.id}
              field={configField}
              key={configField.key}
            />
          ))}
          <InfoRow label="Rows" value={String(rowCount)} />
          <InfoRow
            label="Last synced"
            value={
              status.lastSyncedAt ? formatTimestamp(status.lastSyncedAt) : "—"
            }
          />
        </div>
        {status.error ? (
          <div className="px-2 pb-2 text-xs">
            <span className="text-muted-foreground">Last error</span>
            <p className="mt-0.5 break-words text-destructive">
              {status.error.message}
            </p>
          </div>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          closeOnClick={false}
          disabled={status.syncing}
          onClick={() => {
            requestImmediateSync(database.id);
          }}
        >
          <IconRefresh
            className={status.syncing ? "animate-spin" : undefined}
          />
          {status.syncing ? "Syncing…" : "Refresh now"}
        </DropdownMenuItem>
        <RefreshIntervalSubmenu
          databaseId={database.id}
          refreshMs={source.refreshMs}
        />
        {connector?.auth ? (
          <>
            <DropdownMenuSeparator />
            <ConnectorTokenRow
              auth={connector.auth}
              connectorId={connector.id}
            />
          </>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

interface SourceSubmenuProps {
  database: LocalDatabase;
  rowCount: number;
}

/**
 * Source submenu. Local databases show the read-only storage backing (shard
 * key), row count, and timestamps; connector databases get the full sync
 * section (`ConnectorSourceSubmenu`).
 */
function SourceSubmenu({ database, rowCount }: SourceSubmenuProps) {
  if (database.source?.kind === "connector") {
    return (
      <ConnectorSourceSubmenu
        database={database}
        rowCount={rowCount}
        source={database.source}
      />
    );
  }

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

/**
 * Row pages status row: whether row pages (`/db/{databaseId}/{rowId}`)
 * render from the built-in default template or the database's custom
 * `rowTemplate` (with its block count). A real menu item (not a hand-rolled
 * div) so its icon size, gap, and padding align with the sibling rows in
 * both the popover and drawer presentations; it performs no action yet —
 * template AUTHORING lands with a dedicated template editor (canvas-backed,
 * writing `database.rowTemplate`), and this row becomes its entry point.
 */
function RowPagesItem({ database }: { database: LocalDatabase }) {
  const blockCount = database.rowTemplate?.length ?? 0;
  const status =
    blockCount > 0
      ? `Custom template · ${blockCount} ${blockCount === 1 ? "block" : "blocks"}`
      : "Default template";

  return (
    <DropdownMenuItem closeOnClick={false}>
      <IconFileText />
      Row pages
      <span className="ml-auto min-w-0 truncate text-muted-foreground text-xs">
        {status}
      </span>
    </DropdownMenuItem>
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

interface DatabaseLoadStats {
  /** Row-shard parse time — the dominant cost of loading this database. */
  parseMs: number;
  /** UTF-8 byte size of the stored row shard. */
  sizeBytes: number;
}

/**
 * Storage/load stats for the footer, measured fresh on each menu open: the
 * row shard's byte size and how long it takes to parse (the same work the
 * collection layer does at startup, so it's an honest local "load speed").
 * `null` when storage is unreadable (private-mode restrictions).
 */
function measureDatabaseLoadStats(
  databaseId: string
): DatabaseLoadStats | null {
  try {
    const raw = window.localStorage.getItem(`site-local-db-rows:${databaseId}`);
    if (raw === null) {
      return { parseMs: 0, sizeBytes: 0 };
    }
    const start = performance.now();
    JSON.parse(raw);
    const parseMs = performance.now() - start;
    return { parseMs, sizeBytes: new Blob([raw]).size };
  } catch {
    return null;
  }
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLoadMs(ms: number): string {
  return ms < 1 ? "<1 ms" : `${Math.round(ms)} ms`;
}

export interface DatabaseSettingsMenuProps {
  /**
   * The ACTIVE view (block-resolved) — the per-view sections (Properties
   * visibility, Group, Vertical separators) write to it. Absent only when
   * the database has no views at all (degenerate data).
   */
  activeView?: DatabaseView;
  /**
   * Chart dataset for the active view when it is a chart — powers the "Chart"
   * submenu's per-series/slice color rows. Computed by the entry
   * (`DatabaseTableView`) so it matches what the chart renders. Absent for
   * non-chart views.
   */
  chartData?: ChartData;
  database: LocalDatabase;
  /** Whether the hosting block currently hides the title row text. */
  hideTitle?: boolean;
  /**
   * Runs AFTER `deleteDatabase` on confirm — lets the hosting block remove
   * itself so a deleted database leaves no empty shell. Absent outside a block.
   */
  onDeleted?: () => void;
  /**
   * Toggles the block's `hideTitle` prop. When absent (no block context to
   * write to) the "Hide title" switch row is not rendered.
   */
  onHideTitleChange?: (hideTitle: boolean) => void;
  /** Activates a view — Views submenu Add/Duplicate switch the block to it. */
  onViewIdChange?: (viewId: string) => void;
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
/** Fallback when a chart view's dataset hasn't been threaded in. */
const EMPTY_CHART_DATA: ChartData = {
  categories: [],
  categoryKeys: [],
  series: [],
};

export function DatabaseSettingsMenu({
  activeView,
  chartData,
  database,
  hideTitle = false,
  onDeleted,
  onHideTitleChange,
  onViewIdChange,
  rowCount,
}: DatabaseSettingsMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(database.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [loadStats, setLoadStats] = useState<DatabaseLoadStats | null>(null);

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
        setLoadStats(measureDatabaseLoadStats(database.id));
      } else {
        // Closing commits a pending rename (covers outside click / Escape).
        commitRename();
      }
      setOpen(nextOpen);
    },
    [commitRename, database.id, database.name]
  );

  // Per-view menu sections scope to the block's active view; `views[0]` is
  // only the degenerate fallback (callers without view context).
  const view: DatabaseView | undefined = activeView ?? database.views[0];

  const handleDeleteClick = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    deleteDatabase(database.id);
    setOpen(false);
    // Remove the now-empty hosting block (if any) so the deletion leaves no
    // "not found" shell behind.
    onDeleted?.();
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
        {view ? (
          <PropertiesSubmenu
            database={database}
            onRequestClose={() => {
              handleOpenChange(false);
            }}
            view={view}
          />
        ) : null}
        <ViewsSubmenu database={database} onViewIdChange={onViewIdChange} />
        {/* Grouping drives the table/list render; board columns and chart axes
            have their own per-type options below, so Group is table/list-only
            (it would silently do nothing on a board or chart). */}
        {view && (view.type === "table" || view.type === "list") ? (
          <GroupSubmenu database={database} view={view} />
        ) : null}
        {view && view.type === "board" ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconLayoutKanban />
              Board options
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64 min-w-64">
              <BoardOptionsItems database={database} view={view} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {view && view.type === "chart" ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconChartBar />
              Chart options
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64 min-w-64">
              <ChartOptionsItems
                data={chartData ?? EMPTY_CHART_DATA}
                database={database}
                fields={database.fields}
                view={view}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {onHideTitleChange ? (
          <DropdownMenuSwitchItem
            checked={hideTitle}
            onCheckedChange={onHideTitleChange}
          >
            <IconEyeOff />
            Hide title
          </DropdownMenuSwitchItem>
        ) : null}
        {view && view.type === "table" ? (
          <RowSelectDisplaySubmenu databaseId={database.id} view={view} />
        ) : null}
        {view && view.type === "table" ? (
          <DropdownMenuSwitchItem
            checked={view.config.showVerticalLines !== false}
            onCheckedChange={(next) => {
              updateDatabaseView(database.id, view.id, {
                config: { ...view.config, showVerticalLines: next },
              });
            }}
          >
            <IconColumns3 />
            Vertical separators
          </DropdownMenuSwitchItem>
        ) : null}
        {view && view.type === "table" ? (
          <DropdownMenuSwitchItem
            checked={view.config.showPageIcons !== false}
            onCheckedChange={(next) => {
              updateDatabaseView(database.id, view.id, {
                config: { ...view.config, showPageIcons: next },
              });
            }}
          >
            <IconFileText />
            Page icons
          </DropdownMenuSwitchItem>
        ) : null}
        <DropdownMenuSeparator />
        <SourceSubmenu database={database} rowCount={rowCount} />
        <RowPagesItem database={database} />
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
          {loadStats ? (
            <>
              <StatRow
                label="Size"
                value={formatByteSize(loadStats.sizeBytes)}
              />
              <StatRow
                label="Loads in"
                value={formatLoadMs(loadStats.parseMs)}
              />
            </>
          ) : null}
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
