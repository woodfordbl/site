import {
  IconCheck,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconCopy,
  IconEyeOff,
  IconPinned,
  IconPinnedOff,
  IconPlus,
  IconReplace,
  IconSettings,
  IconSortAscending,
  IconSortDescending,
  IconSum,
  IconTextWrap,
  IconTrash,
} from "@tabler/icons-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  aggregateFnsForFieldType,
  calculationsWithSelection,
  columnOrderWithInsert,
  fieldTypeChangePatch,
  freezePrefixEndingAt,
  isActiveSort,
  isFrozenExactlyAt,
  numberFormatPatch,
  renamedSelectOptions,
  selectOptionsPatch,
  toggledSorts,
  toggledWrapFieldIds,
  visibleFieldIdsAfterHide,
  withAddedSelectOption,
  withoutSelectOption,
} from "@/components/database/database-column-menu-helpers.ts";
import { DATABASE_FIELD_TYPE_ICONS } from "@/components/database/database-field-icons.ts";
import { aggregateFnLabel } from "@/components/database/database-grid-helpers.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  addDatabaseField,
  duplicateDatabaseField,
  removeDatabaseField,
  updateDatabaseField,
  updateDatabaseView,
} from "@/db/queries/database-collection-ops.ts";
import {
  createDatabaseField,
  FIELD_TYPE_DEFS,
} from "@/lib/databases/field-defs.ts";
import {
  type DatabaseAggregateFn,
  type DatabaseField,
  type DatabaseNumberFormat,
  type DatabaseSelectOption,
  type DatabaseTableViewConfig,
  type DatabaseView,
  databaseFieldTypeSchema,
} from "@/lib/schemas/database.ts";

/**
 * Column header menu for the database table grid — mirrors the Notion
 * property menu: rename-in-place at top with the field-type icon, per-type
 * Edit property config, Change type, sort/calculate/freeze/hide/wrap view
 * actions, insert left/right, then Duplicate/Delete per the app's menu
 * conventions. One `DropdownMenu` per header trigger (Base UI owns the
 * open/close lifecycle); all writes go through the database collection ops.
 */

const NUMBER_FORMATS = [
  "plain",
  "integer",
  "percent",
  "currency",
] as const satisfies readonly DatabaseNumberFormat[];

const NUMBER_FORMAT_LABELS: Record<DatabaseNumberFormat, string> = {
  plain: "Plain",
  integer: "Integer",
  percent: "Percent",
  currency: "Currency",
};

/** Trailing check for items with menu-managed (non-checkbox) check state. */
function ItemCheck({ checked }: { checked: boolean }) {
  return checked ? <IconCheck className="ml-auto" /> : null;
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

interface ColumnRenameInputProps {
  draftName: string;
  fieldType: DatabaseField["type"];
  onDraftNameChange: (name: string) => void;
  onSubmit: () => void;
}

/** Autofocused rename input at the top of the menu, with the type icon. */
function ColumnRenameInput({
  draftName,
  fieldType,
  onDraftNameChange,
  onSubmit,
}: ColumnRenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Mounted only while the menu is open — steal focus from the popup after
  // Base UI's initial focus pass (same rAF pattern as the action search).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  const TypeIcon = DATABASE_FIELD_TYPE_ICONS[fieldType];

  return (
    <div className="p-1 pb-2">
      <InputGroup className="h-8">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <TypeIcon className="stroke-[1.5px]" />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Property name"
          autoComplete="off"
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
          placeholder="Property name"
          ref={inputRef}
          value={draftName}
        />
      </InputGroup>
    </div>
  );
}

interface SelectOptionRowProps {
  onDelete: () => void;
  onRename: (name: string) => void;
  option: DatabaseSelectOption;
}

/** One editable option row: inline rename input + delete button. */
function SelectOptionRow({ onDelete, onRename, option }: SelectOptionRowProps) {
  const commit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== "" && trimmed !== option.name) {
      onRename(trimmed);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <InputGroup className="h-8 flex-1">
        <InputGroupInput
          aria-label={`Rename option ${option.name}`}
          autoComplete="off"
          defaultValue={option.name}
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
        aria-label={`Delete option ${option.name}`}
        onClick={onDelete}
        size="icon-xs"
        variant="ghost"
      >
        <IconTrash />
      </Button>
    </div>
  );
}

interface SelectOptionsEditorProps {
  databaseId: string;
  field: DatabaseField & { type: "select" | "multiSelect" };
}

/**
 * Option list editor for select/multi-select fields: rename inline, add via
 * the trailing input, delete per row. Option colors stay default this wave.
 */
function SelectOptionsEditor({ databaseId, field }: SelectOptionsEditorProps) {
  const [newOptionName, setNewOptionName] = useState("");

  const writeOptions = (options: DatabaseSelectOption[]) => {
    updateDatabaseField(databaseId, field.id, selectOptionsPatch(options));
  };

  const addOption = () => {
    const next = withAddedSelectOption(field.options, newOptionName);
    if (next.length !== field.options.length) {
      writeOptions(next);
      setNewOptionName("");
    }
  };

  return (
    <div className="flex flex-col gap-1 p-1">
      <span className="px-0.5 pb-1 font-medium text-muted-foreground text-xs">
        Options
      </span>
      {field.options.map((option) => (
        <SelectOptionRow
          key={option.id}
          onDelete={() => {
            writeOptions(withoutSelectOption(field.options, option.id));
          }}
          onRename={(name) => {
            writeOptions(renamedSelectOptions(field.options, option.id, name));
          }}
          option={option}
        />
      ))}
      <InputGroup className="h-8">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <IconPlus />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Add option"
          autoComplete="off"
          onChange={(event) => {
            setNewOptionName(event.target.value);
          }}
          onKeyDown={(event) => {
            stopMenuKeys(event);
            if (event.key === "Enter") {
              event.preventDefault();
              addOption();
            }
          }}
          placeholder="Add option…"
          value={newOptionName}
        />
      </InputGroup>
    </div>
  );
}

interface EditPropertySubmenuProps {
  databaseId: string;
  field: DatabaseField;
}

/**
 * Per-type "Edit property" config submenu: number → format picker,
 * select/multi-select → option list editor. Types without config render
 * nothing (the submenu is omitted entirely).
 */
function EditPropertySubmenu({ databaseId, field }: EditPropertySubmenuProps) {
  if (field.type === "number") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <IconSettings />
          Edit property
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuLabel>Number format</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              updateDatabaseField(
                databaseId,
                field.id,
                numberFormatPatch(value as DatabaseNumberFormat)
              );
            }}
            value={field.format ?? "plain"}
          >
            {NUMBER_FORMATS.map((format) => (
              <DropdownMenuRadioItem key={format} value={format}>
                {NUMBER_FORMAT_LABELS[format]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  if (field.type === "select" || field.type === "multiSelect") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <IconSettings />
          Edit property
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <SelectOptionsEditor databaseId={databaseId} field={field} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return null;
}

interface ChangeTypeSubmenuProps {
  databaseId: string;
  field: DatabaseField;
}

/**
 * "Change type" submenu over all seven field types. Cell values are NOT
 * migrated this wave — see `fieldTypeChangePatch`.
 */
function ChangeTypeSubmenu({ databaseId, field }: ChangeTypeSubmenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconReplace />
        Change type
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {databaseFieldTypeSchema.options.map((type) => {
          const TypeIcon = DATABASE_FIELD_TYPE_ICONS[type];
          return (
            <DropdownMenuItem
              key={type}
              onClick={() => {
                if (type !== field.type) {
                  updateDatabaseField(
                    databaseId,
                    field.id,
                    fieldTypeChangePatch(type)
                  );
                }
              }}
            >
              <TypeIcon className="stroke-[1.5px]" />
              {FIELD_TYPE_DEFS[type].label}
              <ItemCheck checked={type === field.type} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

interface CalculateSubmenuProps {
  activeFn: DatabaseAggregateFn | undefined;
  field: DatabaseField;
  onSelect: (fn: DatabaseAggregateFn | null) => void;
}

/** "Calculate" submenu: None + the aggregates valid for the field's type. */
function CalculateSubmenu({
  activeFn,
  field,
  onSelect,
}: CalculateSubmenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconSum />
        Calculate
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem
          onClick={() => {
            onSelect(null);
          }}
        >
          None
          <ItemCheck checked={activeFn === undefined} />
        </DropdownMenuItem>
        {aggregateFnsForFieldType(field.type).map((fn) => (
          <DropdownMenuItem
            key={fn}
            onClick={() => {
              onSelect(fn);
            }}
          >
            {aggregateFnLabel(fn)}
            <ItemCheck checked={activeFn === fn} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export interface DatabaseColumnMenuProps {
  /** Header cell visual, rendered inside the trigger button. */
  children: ReactNode;
  databaseId: string;
  /** Grid display order (pinned first) — freeze prefixes and inserts key off it. */
  displayFieldIds: readonly string[];
  field: DatabaseField;
  /** The primary field can't be hidden or deleted. */
  isPrimary: boolean;
  triggerClassName?: string;
  view: DatabaseView;
}

/** Column header dropdown menu — one per header cell in edit mode. */
export function DatabaseColumnMenu({
  children,
  databaseId,
  displayFieldIds,
  field,
  isPrimary,
  triggerClassName,
  view,
}: DatabaseColumnMenuProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(field.name);
  const config = view.config;
  const viewId = view.id;

  const commitRename = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed !== "" && trimmed !== field.name) {
      updateDatabaseField(databaseId, field.id, { name: trimmed });
    }
  }, [databaseId, draftName, field.id, field.name]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setDraftName(field.name);
      } else {
        // Closing commits a pending rename (covers outside click / Escape).
        commitRename();
      }
      setOpen(nextOpen);
    },
    [commitRename, field.name]
  );

  const patchConfig = (patch: Partial<DatabaseTableViewConfig>) => {
    updateDatabaseView(databaseId, viewId, {
      config: { ...config, ...patch },
    });
  };

  const freezePrefix = freezePrefixEndingAt(displayFieldIds, field.id);
  const frozenHere = isFrozenExactlyAt(config.pinnedFieldIds, freezePrefix);
  const sortedAsc = isActiveSort(view.sorts, field.id, "asc");
  const sortedDesc = isActiveSort(view.sorts, field.id, "desc");

  const applySort = (direction: "asc" | "desc") => {
    updateDatabaseView(databaseId, viewId, {
      sorts: toggledSorts(view.sorts, field.id, direction),
    });
  };

  const insertField = (side: "left" | "right") => {
    const newField = createDatabaseField("text", "Text");
    addDatabaseField(databaseId, newField);
    const storedOrder = config.columnOrder;
    const baseOrder = storedOrder?.includes(field.id)
      ? storedOrder
      : displayFieldIds;
    updateDatabaseView(databaseId, viewId, {
      // A materialized visible list must adopt the new field explicitly.
      visibleFieldIds: view.visibleFieldIds
        ? [...view.visibleFieldIds, newField.id]
        : undefined,
      config: {
        ...config,
        columnOrder: columnOrderWithInsert(
          baseOrder,
          field.id,
          side,
          newField.id
        ),
      },
    });
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange} open={open}>
      <DropdownMenuTrigger
        render={<button className={triggerClassName} type="button" />}
      >
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 min-w-64">
        <ColumnRenameInput
          draftName={draftName}
          fieldType={field.type}
          onDraftNameChange={setDraftName}
          onSubmit={() => {
            commitRename();
            setOpen(false);
          }}
        />
        <DropdownMenuLabel>
          {FIELD_TYPE_DEFS[field.type].label}
        </DropdownMenuLabel>
        <EditPropertySubmenu databaseId={databaseId} field={field} />
        <ChangeTypeSubmenu databaseId={databaseId} field={field} />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            applySort("asc");
          }}
        >
          <IconSortAscending />
          Sort ascending
          <ItemCheck checked={sortedAsc} />
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            applySort("desc");
          }}
        >
          <IconSortDescending />
          Sort descending
          <ItemCheck checked={sortedDesc} />
        </DropdownMenuItem>
        <CalculateSubmenu
          activeFn={config.calculations?.[field.id]}
          field={field}
          onSelect={(fn) => {
            patchConfig({
              calculations: calculationsWithSelection(
                config.calculations,
                field.id,
                fn
              ),
            });
          }}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            patchConfig({
              pinnedFieldIds: frozenHere ? undefined : freezePrefix,
            });
          }}
        >
          {frozenHere ? <IconPinnedOff /> : <IconPinned />}
          {frozenHere ? "Unfreeze columns" : "Freeze up to this column"}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isPrimary}
          onClick={() => {
            updateDatabaseView(databaseId, viewId, {
              visibleFieldIds: visibleFieldIdsAfterHide(
                view.visibleFieldIds,
                displayFieldIds,
                field.id
              ),
            });
          }}
        >
          <IconEyeOff />
          Hide property
        </DropdownMenuItem>
        <DropdownMenuSwitchItem
          checked={config.wrapFieldIds?.includes(field.id) ?? false}
          onCheckedChange={() => {
            patchConfig({
              wrapFieldIds: toggledWrapFieldIds(config.wrapFieldIds, field.id),
            });
          }}
        >
          <IconTextWrap />
          Wrap content
        </DropdownMenuSwitchItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            insertField("left");
          }}
        >
          <IconColumnInsertLeft />
          Insert left
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            insertField("right");
          }}
        >
          <IconColumnInsertRight />
          Insert right
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            duplicateDatabaseField(databaseId, field.id);
          }}
        >
          <IconCopy />
          Duplicate property
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isPrimary}
          onClick={() => {
            removeDatabaseField(databaseId, field.id);
          }}
          variant="destructive"
        >
          <IconTrash />
          Delete property
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
