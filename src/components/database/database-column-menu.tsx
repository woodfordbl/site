import {
  IconAlertTriangle,
  IconCheck,
  IconCloudDown,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconCopy,
  IconEyeOff,
  IconFileText,
  IconLayoutGrid,
  IconMinus,
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
import { format as formatDate } from "date-fns/format";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BlockColorSwatch } from "@/components/canvas/block-color-swatch.tsx";
import {
  aggregateFnsForFieldType,
  calculationsWithSelection,
  columnOrderWithInsert,
  dateFormatPatch,
  expressionPatch,
  fieldTypeChangePatch,
  formulaPreviewRows,
  freezePrefixEndingAt,
  isFrozenExactlyAt,
  logicalColumnOrder,
  MAX_NUMBER_DECIMALS,
  numberDecimalsPatch,
  numberFormatPatch,
  numberGroupingPatch,
  recoloredSelectOptions,
  renamedSelectOptions,
  selectOptionsPatch,
  showsEditPropertySubmenu,
  steppedDecimals,
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
import { FormulaEditorPanel } from "@/components/database/formula-editor-panel.tsx";
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
import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import {
  addDatabaseField,
  duplicateDatabaseField,
  removeDatabaseField,
  updateDatabaseField,
  updateDatabaseView,
} from "@/db/queries/database-collection-ops.ts";
import { useDatabase, useDatabaseRows } from "@/db/queries/use-database.ts";
import { formatCellValue } from "@/lib/databases/cell-values.ts";
import {
  createDatabaseField,
  FIELD_TYPE_DEFS,
} from "@/lib/databases/field-defs.ts";
import { formulaDisplayInfo } from "@/lib/databases/formula-values.ts";
import { isGroupableField } from "@/lib/databases/row-group.ts";
import { canonicalizeExpression } from "@/lib/formula/ref-rewrite.ts";
import { ensurePageIconPickerReady } from "@/lib/pages/preload-page-icon-picker.ts";
import {
  type DatabaseAggregateFn,
  type DatabaseDateFormat,
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

/** Sample rendered by the number submenu's live example line. */
const NUMBER_EXAMPLE_VALUE = 1234.5678;

const DATE_FORMATS = [
  "default",
  "long",
  "relative",
  "iso",
] as const satisfies readonly DatabaseDateFormat[];

const DATE_FORMAT_LABELS: Record<DatabaseDateFormat, string> = {
  default: "Default",
  long: "Long",
  relative: "Relative",
  iso: "ISO",
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
      <InputGroup className="h-8 pointer-coarse:h-10">
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
            wrapper's trailing chevron is hidden. Sizing applies in BOTH
            presentations (the drawer row would otherwise stretch full-width
            and crush the rename input); touch gets a larger hit area. */}
        <DropdownMenuSubTrigger
          aria-label={`Change color for option ${option.name}`}
          className="pointer-coarse:size-10 size-7 shrink-0 justify-center rounded-md p-0 [&>span]:justify-center [&>svg]:hidden"
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
      <InputGroup className="h-8 pointer-coarse:h-10 flex-1">
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
      <InputGroup className="h-8 pointer-coarse:h-10">
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
  /** Closes the whole column menu after Save. */
  onSaved: () => void;
}

/**
 * Formula builder inside the Edit property submenu: threads the live schema
 * and the first rows (manual/table order, capped at
 * `FORMULA_PREVIEW_ROW_LIMIT`, labeled by primary-field text) into the
 * shared `FormulaEditorPanel` so it can render the Properties section and
 * the live preview with its row picker. Mounted only while the submenu is
 * open, so the live queries here cost nothing for non-formula columns. The
 * panel emits field-id canonical text; Save writes it only when it differs
 * from the stored expression's canonical form (evaluation is read-time —
 * the overlay recomputes on write).
 */
function FormulaExpressionEditor({
  databaseId,
  field,
  onSaved,
}: FormulaExpressionEditorProps) {
  const database = useDatabase(databaseId);
  const rows = useDatabaseRows(databaseId);
  const fields = database?.fields ?? [];
  const primaryFieldId = database?.primaryFieldId;
  const previewRows = useMemo(
    () =>
      formulaPreviewRows(
        rows,
        database?.fields.find((candidate) => candidate.id === primaryFieldId)
      ),
    [rows, database?.fields, primaryFieldId]
  );

  return (
    <FormulaEditorPanel
      expression={field.expression}
      fields={fields}
      onSave={(expression) => {
        if (
          expression !== canonicalizeExpression(field.expression, fields).text
        ) {
          updateDatabaseField(
            databaseId,
            field.id,
            expressionPatch(expression)
          );
        }
        onSaved();
      }}
      previewRows={previewRows}
    />
  );
}

interface NumberPropertyEditorProps {
  databaseId: string;
  field: DatabaseField & { type: "number" };
}

/**
 * Number display config: the format preset radio, a Decimals stepper (Auto =
 * the format's natural precision, 0-6 pins fixed fraction digits), a
 * thousands-separators switch, and a muted live example line rendering
 * {@link NUMBER_EXAMPLE_VALUE} through the real cell formatter so it can
 * never drift from grid output.
 *
 * Excel-style custom format strings ("#,##0.00"-style codes) are a
 * deliberate non-goal here: the presets plus decimals plus grouping cover
 * the practical range, and custom codes would need a pattern parser and an
 * error surface for invalid input.
 */
function NumberPropertyEditor({
  databaseId,
  field,
}: NumberPropertyEditorProps) {
  const stepDecimals = (delta: 1 | -1) => {
    updateDatabaseField(
      databaseId,
      field.id,
      numberDecimalsPatch(steppedDecimals(field.decimals, delta))
    );
  };

  return (
    <>
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
      <DropdownMenuSeparator />
      <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-1.5 text-sm">
        Decimals
        <span className="flex items-center gap-0.5">
          <Button
            aria-label="Fewer decimals"
            disabled={field.decimals === undefined}
            onClick={() => {
              stepDecimals(-1);
            }}
            size="icon-xs"
            variant="ghost"
          >
            <IconMinus />
          </Button>
          <span className="min-w-8 text-center text-muted-foreground text-xs tabular-nums">
            {field.decimals ?? "Auto"}
          </span>
          <Button
            aria-label="More decimals"
            disabled={field.decimals === MAX_NUMBER_DECIMALS}
            onClick={() => {
              stepDecimals(1);
            }}
            size="icon-xs"
            variant="ghost"
          >
            <IconPlus />
          </Button>
        </span>
      </div>
      <DropdownMenuSwitchItem
        checked={field.useGrouping !== false}
        onCheckedChange={(checked) => {
          updateDatabaseField(
            databaseId,
            field.id,
            numberGroupingPatch(checked)
          );
        }}
      >
        Thousands separators
      </DropdownMenuSwitchItem>
      <DropdownMenuSeparator />
      {/* Live example: the field already carries the current settings, so
          formatting it directly reflects every change immediately. */}
      <div className="px-2 py-1 text-muted-foreground text-xs tabular-nums">
        {formatCellValue(field, NUMBER_EXAMPLE_VALUE)}
      </div>
    </>
  );
}

interface DatePropertyEditorProps {
  databaseId: string;
  field: DatabaseField & { type: "date" };
}

/**
 * Date display config: the format radio (Default / Long / Relative / ISO),
 * each option trailed by a muted example of TODAY's date rendered through
 * the real cell formatter so examples never drift from grid output. Writes
 * go through `dateFormatPatch` (Default clears the key — absent = default).
 */
function DatePropertyEditor({ databaseId, field }: DatePropertyEditorProps) {
  // Local date parts (not toISOString) so the example never shows the UTC
  // calendar day near midnight.
  const todayIso = formatDate(new Date(), "yyyy-MM-dd");
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Date format</DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuRadioGroup
        onValueChange={(value) => {
          updateDatabaseField(
            databaseId,
            field.id,
            dateFormatPatch(value as DatabaseDateFormat)
          );
        }}
        value={field.format ?? "default"}
      >
        {DATE_FORMATS.map((dateFormat) => (
          <DropdownMenuRadioItem key={dateFormat} value={dateFormat}>
            {DATE_FORMAT_LABELS[dateFormat]}
            <span className="ml-auto pl-3 text-muted-foreground text-xs">
              {formatCellValue({ ...field, format: dateFormat }, todayIso)}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

interface EditPropertySubmenuProps {
  databaseId: string;
  /**
   * Synced columns: only date/number display config (format, decimals,
   * grouping). Formula expression and select options stay hidden.
   */
  displayOnly?: boolean;
  field: DatabaseField;
  /** Closes the whole column menu (used after the formula editor saves). */
  onRequestClose: () => void;
}

/**
 * Per-type "Edit property" config submenu: number → format/decimals/grouping
 * display config, date → display format picker, select/multi-select → option
 * list editor, formula → expression editor. Types without config render
 * nothing (the submenu is omitted entirely). `displayOnly` limits synced
 * columns to date/number presentation settings.
 */
function EditPropertySubmenu({
  databaseId,
  displayOnly = false,
  field,
  onRequestClose,
}: EditPropertySubmenuProps) {
  if (displayOnly && field.type !== "date" && field.type !== "number") {
    return null;
  }

  if (field.type === "formula") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <IconSettings />
          Edit property
        </DropdownMenuSubTrigger>
        {/* Wider than the standard submenu so the builder's reference list
            breathes; ignored in drawer presentation (panel is width-fluid). */}
        <DropdownMenuSubContent className="w-[360px] min-w-[360px]">
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
          <NumberPropertyEditor databaseId={databaseId} field={field} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  if (field.type === "date") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <IconSettings />
          Edit property
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DatePropertyEditor databaseId={databaseId} field={field} />
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
  // plus date/number display config (format, decimals, grouping). Schema-
  // destructive edits (type, select options, formula expression, delete)
  // stay blocked — cell values remain provider-owned.
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
            <DropdownMenuLabel className="flex items-center gap-2">
              <span className="min-w-0 truncate">
                {FIELD_TYPE_DEFS[field.type].label}
              </span>
              {synced ? (
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 font-normal text-[11px] text-muted-foreground">
                  <IconCloudDown
                    aria-hidden
                    className="size-3 stroke-[1.5px]"
                  />
                  Synced
                </span>
              ) : null}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {showsEditPropertySubmenu(field, synced) ? (
            <EditPropertySubmenu
              databaseId={databaseId}
              displayOnly={synced}
              field={field}
              onRequestClose={() => {
                handleOpenChange(false);
              }}
            />
          ) : null}
          {synced ? null : (
            <ChangeTypeSubmenu databaseId={databaseId} field={field} />
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
          {isPrimary ? (
            <DropdownMenuSwitchItem
              checked={config.showPageIcons !== false}
              onCheckedChange={(next) => {
                patchConfig({ showPageIcons: next });
              }}
            >
              <IconFileText />
              Show page icon
            </DropdownMenuSwitchItem>
          ) : null}
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
