import {
  IconAlertTriangle,
  IconCheck,
  IconCloudDown,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconCopy,
  IconEyeOff,
  IconLayoutGrid,
  IconPhoto,
  IconPhotoOff,
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
import { useQueryClient } from "@tanstack/react-query";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { BlockColorSwatch } from "@/components/canvas/block-color-swatch.tsx";
import {
  aggregateFnsForFieldType,
  calculationsWithSelection,
  columnOrderWithInsert,
  expressionPatch,
  fieldTypeChangePatch,
  freezePrefixEndingAt,
  isFrozenExactlyAt,
  logicalColumnOrder,
  numberFormatPatch,
  recoloredSelectOptions,
  renamedSelectOptions,
  selectOptionsPatch,
  toggledWrapFieldIds,
  visibleFieldIdsAfterHide,
  withAddedSelectOption,
  withoutSelectOption,
} from "@/components/database/database-column-menu-helpers.ts";
import {
  DATABASE_FIELD_TYPE_ICONS,
  resolveFieldIcon,
} from "@/components/database/database-field-icons.ts";
import {
  sortEntryFor,
  sortPriority,
  toggledSorts,
} from "@/components/database/database-filter-helpers.ts";
import {
  aggregateFnLabel,
  isSyncedField,
} from "@/components/database/database-grid-helpers.ts";
import { DatabaseOptionColorMenuItems } from "@/components/database/database-option-color-menu.tsx";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import { Textarea } from "@/components/ui/textarea.tsx";
import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
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
import { formulaDisplayInfo } from "@/lib/databases/formula-values.ts";
import { isGroupableField } from "@/lib/databases/row-group.ts";
import { parseExpression } from "@/lib/expr/parse.ts";
import { ensurePageIconPickerReady } from "@/lib/pages/preload-page-icon-picker.ts";
import {
  type DatabaseAggregateFn,
  type DatabaseField,
  type DatabaseNumberFormat,
  type DatabaseSelectOption,
  type DatabaseTableViewConfig,
  type DatabaseView,
  databaseFieldTypeSchema,
} from "@/lib/schemas/database.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";

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

/**
 * Trailing check for items with menu-managed (non-checkbox) check state.
 * `priority` (1-based, multi-sort views only) renders beside the check so
 * users can read each field's rank in the sort order.
 */
function ItemCheck({
  checked,
  priority,
}: {
  checked: boolean;
  priority?: number | null;
}) {
  if (!checked) {
    return null;
  }
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      {priority ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          {priority}
        </span>
      ) : null}
      <IconCheck />
    </span>
  );
}

/**
 * Keep typing inside menu-embedded inputs from triggering the menu's
 * typeahead/arrow navigation; Escape still propagates so it closes the menu.
 */
function stopMenuKeys(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

interface ColumnRenameInputProps {
  draftName: string;
  field: DatabaseField;
  onDraftNameChange: (name: string) => void;
  onSubmit: () => void;
}

/** Autofocused rename input at the top of the menu, with the field's icon. */
function ColumnRenameInput({
  draftName,
  field,
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

  const FieldIcon = resolveFieldIcon(field);

  return (
    <div className="p-1 pb-2">
      <InputGroup className="h-8">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <FieldIcon className="stroke-[1.5px]" />
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
  onSelectColor: (color: BlockColor | undefined) => void;
  option: DatabaseSelectOption;
}

/**
 * One editable option row: leading color-swatch submenu (the block-color
 * palette shared with the canvas highlight picker), inline rename input, and
 * a delete button.
 */
function SelectOptionRow({
  onDelete,
  onRename,
  onSelectColor,
  option,
}: SelectOptionRowProps) {
  const commit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== "" && trimmed !== option.name) {
      onRename(trimmed);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <DropdownMenuSub>
        {/* Compact swatch-only trigger: the swatch is the label, so the
            wrapper's trailing chevron is hidden. */}
        <DropdownMenuSubTrigger
          aria-label={`Change color for option ${option.name}`}
          className="size-7 shrink-0 justify-center p-0 [&>svg]:hidden"
        >
          <BlockColorSwatch color={option.color} variant="background" />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DatabaseOptionColorMenuItems
            color={option.color}
            onSelectColor={onSelectColor}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
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
 * Option list editor for select/multi-select fields: rename inline, recolor
 * via each row's leading swatch submenu, add via the trailing input, delete
 * per row.
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
          onSelectColor={(color) => {
            writeOptions(
              recoloredSelectOptions(field.options, option.id, color)
            );
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

interface FormulaExpressionEditorProps {
  databaseId: string;
  field: DatabaseField & { type: "formula" };
  /** Closes the whole column menu after a successful Save. */
  onSaved: () => void;
}

/**
 * Formula editor inside the Edit property submenu: a monospace textarea over
 * the field's expression with live parse feedback (positioned error message,
 * muted "✓ Valid" when the draft parses), a `thisPage.Property` reference
 * hint, and an explicit Save (evaluation is read-time — saving simply
 * rewrites the expression and the overlay recomputes).
 */
function FormulaExpressionEditor({
  databaseId,
  field,
  onSaved,
}: FormulaExpressionEditorProps) {
  const [draft, setDraft] = useState(field.expression);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mounted only while the submenu is open — steal focus from the popup
  // after Base UI's initial focus pass (same rAF pattern as the rename input).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  const trimmed = draft.trim();
  const parsed = trimmed === "" ? null : parseExpression(draft);

  let feedback: ReactNode = null;
  if (parsed !== null) {
    feedback = parsed.ok ? (
      <span className="px-0.5 text-muted-foreground text-xs">✓ Valid</span>
    ) : (
      <span className="px-0.5 text-destructive text-xs">
        {parsed.error.message} (at character {parsed.error.position + 1})
      </span>
    );
  }

  return (
    <div className="flex w-72 flex-col gap-1.5 p-1">
      <span className="px-0.5 font-medium text-muted-foreground text-xs">
        Formula
      </span>
      <Textarea
        aria-label="Formula expression"
        autoComplete="off"
        className="min-h-20 font-mono text-xs md:text-xs"
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={stopMenuKeys}
        placeholder="thisPage.Price * 1.1"
        ref={textareaRef}
        spellCheck={false}
        value={draft}
      />
      {feedback}
      <span className="px-0.5 text-muted-foreground text-xs">
        Use thisPage.Property — e.g. thisPage.Price * 1.1
      </span>
      <Button
        className="self-end"
        onClick={() => {
          if (draft !== field.expression) {
            updateDatabaseField(databaseId, field.id, expressionPatch(draft));
          }
          onSaved();
        }}
        size="xs"
        variant="outline"
      >
        Save
      </Button>
    </div>
  );
}

interface EditPropertySubmenuProps {
  databaseId: string;
  field: DatabaseField;
  /** Closes the whole column menu (used after the formula editor saves). */
  onRequestClose: () => void;
}

/**
 * Per-type "Edit property" config submenu: number → format picker,
 * select/multi-select → option list editor, formula → expression editor.
 * Types without config render nothing (the submenu is omitted entirely).
 */
function EditPropertySubmenu({
  databaseId,
  field,
  onRequestClose,
}: EditPropertySubmenuProps) {
  if (field.type === "formula") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <IconSettings />
          Edit property
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <FormulaExpressionEditor
            databaseId={databaseId}
            field={field}
            onSaved={onRequestClose}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  if (field.type === "number") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <IconSettings />
          Edit property
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Number format</DropdownMenuLabel>
          </DropdownMenuGroup>
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
 * "Change type" submenu over every field type (formula included — changing
 * TO formula starts with an empty expression written via Edit property).
 * Cell values are NOT migrated this wave — see `fieldTypeChangePatch`.
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
  // The picker opens anchored to the header cell after the menu closes —
  // same controlled `hideTrigger` pattern as the sidebar "Change icon".
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
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

  // Synced (connector-written) fields keep view-level and cosmetic actions
  // (rename, icon, sort, calculate, freeze, hide, wrap, duplicate-as-local)
  // but never schema-destructive ones: type/config edits and deletion would
  // fight the sync engine's reconciliation.
  const synced = isSyncedField(field);
  // Broken formula badge on the header (parse errors only — per-row
  // evaluation errors render in their cells instead).
  const { parseError } = formulaDisplayInfo(field);
  const freezePrefix = freezePrefixEndingAt(displayFieldIds, field.id);
  const frozenHere = isFrozenExactlyAt(config.pinnedFieldIds, freezePrefix);
  const sortEntry = sortEntryFor(view.sorts, field.id);
  // Rank shown beside the check only when the view is multi-sorted.
  const fieldSortPriority =
    (view.sorts?.length ?? 0) > 1 ? sortPriority(view.sorts, field.id) : null;

  const applySort = (direction: "asc" | "desc") => {
    updateDatabaseView(databaseId, viewId, {
      sorts: toggledSorts(view.sorts, field.id, direction),
    });
  };

  const isGroupedByField = view.groupBy?.fieldId === field.id;
  const toggleGroupBy = () => {
    // Grouping by a new field (or clearing) always resets the collapse
    // state — collapsed keys belong to the previous field's buckets.
    updateDatabaseView(databaseId, viewId, {
      groupBy: isGroupedByField ? undefined : { fieldId: field.id },
      config: { ...config, collapsedGroupKeys: undefined },
    });
  };

  const writeIcon = (icon: string | undefined) => {
    updateDatabaseField(databaseId, field.id, { icon });
  };

  const insertField = (side: "left" | "right") => {
    // Splice against the view's persisted LOGICAL order (stored columnOrder
    // completed with the remaining schema fields, hidden included) — never
    // the pinned-first, hidden-excluding, viewport-dependent display order,
    // which would permanently bake transient display state into the view.
    const allFieldIds = (
      localDatabasesCollection.get(databaseId)?.fields ?? []
    ).map((existing) => existing.id);
    const baseOrder = logicalColumnOrder(config.columnOrder, allFieldIds);
    const newField = createDatabaseField("text", "Text");
    addDatabaseField(databaseId, newField);
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
    <>
      <DropdownMenu onOpenChange={handleOpenChange} open={open}>
        <DropdownMenuTrigger
          render={
            <button
              className={triggerClassName}
              ref={triggerRef}
              type="button"
            />
          }
        >
          {children}
          {parseError ? (
            <span
              className="ml-auto inline-flex shrink-0 text-(--block-text-yellow)"
              title={`Formula error: ${parseError}`}
            >
              <IconAlertTriangle aria-hidden className="size-3.5" />
              <span className="sr-only">Formula error: {parseError}</span>
            </span>
          ) : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64 min-w-64">
          <ColumnRenameInput
            draftName={draftName}
            field={field}
            onDraftNameChange={setDraftName}
            onSubmit={() => {
              commitRename();
              setOpen(false);
            }}
          />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center">
              {FIELD_TYPE_DEFS[field.type].label}
              {synced ? (
                <span className="ml-auto inline-flex items-center gap-1 font-normal">
                  <IconCloudDown
                    aria-hidden
                    className="size-3.5 stroke-[1.5px]"
                  />
                  Synced
                </span>
              ) : null}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {synced ? null : (
            <>
              <EditPropertySubmenu
                databaseId={databaseId}
                field={field}
                onRequestClose={() => {
                  handleOpenChange(false);
                }}
              />
              <ChangeTypeSubmenu databaseId={databaseId} field={field} />
            </>
          )}
          <DropdownMenuItem
            onClick={() => {
              setIconPickerOpen(true);
            }}
            onPointerEnter={() => {
              // Warm picker chunks + catalogs on intent (AGENTS.md pickers).
              ensurePageIconPickerReady(queryClient);
            }}
          >
            <IconPhoto />
            Change icon
          </DropdownMenuItem>
          {field.icon ? (
            <DropdownMenuItem
              onClick={() => {
                writeIcon(undefined);
              }}
            >
              <IconPhotoOff />
              Remove icon
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              applySort("asc");
            }}
          >
            <IconSortAscending />
            Sort ascending
            <ItemCheck
              checked={sortEntry?.direction === "asc"}
              priority={fieldSortPriority}
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              applySort("desc");
            }}
          >
            <IconSortDescending />
            Sort descending
            <ItemCheck
              checked={sortEntry?.direction === "desc"}
              priority={fieldSortPriority}
            />
          </DropdownMenuItem>
          {isGroupableField(field) ? (
            <DropdownMenuItem onClick={toggleGroupBy}>
              <IconLayoutGrid />
              Group by
              <ItemCheck checked={isGroupedByField} />
            </DropdownMenuItem>
          ) : null}
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
                wrapFieldIds: toggledWrapFieldIds(
                  config.wrapFieldIds,
                  field.id
                ),
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
            disabled={isPrimary || synced}
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
      <GlyphIconPicker
        anchor={triggerRef}
        ariaLabel={`Change icon for ${field.name}`}
        hideTrigger
        icon={field.icon}
        onOpenChange={setIconPickerOpen}
        onRemove={() => {
          writeIcon(undefined);
        }}
        onSelect={writeIcon}
        open={iconPickerOpen}
      />
    </>
  );
}
