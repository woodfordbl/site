import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconLayoutGrid,
  IconPlus,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { format } from "date-fns/format";
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DateRange } from "react-day-picker";
import { createPortal } from "react-dom";

import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import {
  appendFilterCondition,
  conditionOptionIds,
  conditionValueLabel,
  flippedSortDirection,
  innerGroupChipLabel,
  isFilterInnerGroup,
  patchFilterCondition,
  removeFilterEntry,
  setFilterOp,
  toggleConditionOptionId,
  withoutSort,
} from "@/components/database/database-filter-helpers.ts";
import { isoDateToLocalDate } from "@/components/database/database-grid-helpers.ts";
import { DatabaseOptionCombobox } from "@/components/database/database-option-combobox.tsx";
import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import {
  type ListReorderDragPreview,
  type ListReorderHandleProps,
  resolveReorderTarget,
  useListReorder,
} from "@/components/database/use-list-reorder.ts";
import { Calendar } from "@/components/ui/calendar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { useResolvedMenuPresentation } from "@/components/ui/menu-presentation.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { updateDatabaseView } from "@/db/queries/database-collection-ops.ts";
import { toIsoDatePart } from "@/lib/databases/cell-values.ts";
import {
  FIELD_TYPE_DEFS,
  operatorLabel,
  operatorNeedsRange,
  operatorNeedsValue,
} from "@/lib/databases/field-defs.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseFilterCondition,
  DatabaseFilterGroup,
  DatabaseFilterGroupOp,
  DatabaseFilterInnerGroup,
  DatabaseFilterOperator,
  DatabaseSort,
  DatabaseView,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Linear-style filter chip bar rendered between the database title and the
 * grid (edit mode, non-narrow viewports with active filters/sorts/grouping;
 * narrow viewports render the same chip bar below the title when the title-row
 * funnel/sort toggles expand it — see `database-mobile-toolbar.tsx`). One chip
 * per root-level condition — field, operator, and value are separate click
 * targets editing in place via popovers — plus a Match all/any control once
 * two or more root entries exist, and one sort chip per view sort in priority
 * order (flip direction, drag-reorder when multi-sort, remove). Each title-row icon toggles
 * the whole bar when its category exists; otherwise it opens a field dropdown
 * to add the first filter or sort (adding expands the bar).
 *
 * Deferred (per §5.2 of the databases proposal):
 * - All writes mutate the saved view directly through `updateDatabaseView`;
 *   the ephemeral-vs-saved filter split ("Save to view / Reset") comes later.
 * - Inner groups already present in data render as read-only bracketed chips
 *   with a remove action; creating/editing groups via UI arrives later.
 */

// `pointer-coarse:` bumps: 24px-tall chip segments are too small a touch
// target, so chips grow to 32px with wider segment padding on touch devices.
const CHIP_CLASS =
  "flex h-6 shrink-0 items-stretch divide-x divide-border overflow-hidden rounded-md border border-border bg-background text-xs pointer-coarse:h-8";

const CHIP_SEGMENT_CLASS =
  "flex items-center gap-1 px-1.5 text-muted-foreground outline-none transition-colors pointer-coarse:px-2";

const CHIP_BUTTON_CLASS = cn(
  CHIP_SEGMENT_CLASS,
  "hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
);

/** Small dashed "+ Filter"/"+ Sort" chip trigger (inline bars). */
const ADD_CHIP_CLASS =
  "flex h-6 pointer-coarse:h-8 shrink-0 items-center gap-1 rounded-md border border-border border-dashed pointer-coarse:px-2 px-1.5 text-muted-foreground text-xs outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground";

/**
 * Full-width dashed add trigger for the mobile filter/sort drawers — fills the
 * surface width inside the container's own padding (`w-full` under the
 * popover/drawer `p-2`).
 */
const ADD_FULL_WIDTH_CLASS =
  "flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-border border-dashed px-2 text-muted-foreground text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground";

interface ChipStripProps {
  /**
   * Wrapper class. The desktop bar passes `contents` so the chips join its
   * single flex-wrap row; the mobile popovers pass their own flex container.
   */
  className?: string;
  databaseId: string;
  fields: readonly DatabaseField[];
  view: DatabaseView;
}

/**
 * The filter half of the chip bar: one chip per root filter entry plus the
 * "+ Filter" type-ahead picker. Reused by the desktop inline bar and the
 * mobile funnel popover.
 */
export function DatabaseFilterChips({
  addFullWidth = false,
  className,
  databaseId,
  fields,
  showAddTrigger = true,
  view,
}: ChipStripProps & {
  addFullWidth?: boolean;
  /** When false, omit the dashed "+ Filter" chip (title funnel adds on mobile). */
  showAddTrigger?: boolean;
}): ReactNode {
  // Condition whose value popover should open as soon as its chip mounts —
  // set when "+ Filter" appends a fresh condition.
  const [autoOpenId, setAutoOpenId] = useState<string | null>(null);

  const fieldsById = useMemo(() => {
    const byId: Record<string, DatabaseField> = {};
    for (const field of fields) {
      byId[field.id] = field;
    }
    return byId;
  }, [fields]);

  const applyFilterChange = (filter: DatabaseFilterGroup | undefined) => {
    updateDatabaseView(databaseId, view.id, { filter });
  };

  const handleAddField = (field: DatabaseField) => {
    const condition: DatabaseFilterCondition = {
      id: crypto.randomUUID(),
      fieldId: field.id,
      operator: FIELD_TYPE_DEFS[field.type].defaultOperator,
    };
    setAutoOpenId(condition.id);
    applyFilterChange(appendFilterCondition(view.filter, condition));
  };

  const handlePatchCondition = (
    conditionId: string,
    patch: Partial<Pick<DatabaseFilterCondition, "operator" | "value">>
  ) => {
    if (view.filter) {
      applyFilterChange(patchFilterCondition(view.filter, conditionId, patch));
    }
  };

  const handleRemoveEntry = (entryId: string) => {
    if (view.filter) {
      applyFilterChange(removeFilterEntry(view.filter, entryId));
    }
  };

  const rootEntries = view.filter?.conditions ?? [];

  return (
    <div className={className}>
      {rootEntries.map((entry) =>
        isFilterInnerGroup(entry) ? (
          <FilterGroupChip
            group={entry}
            key={entry.id}
            onRemove={() => handleRemoveEntry(entry.id)}
          />
        ) : (
          <FilterConditionChip
            autoOpenValue={autoOpenId === entry.id}
            condition={entry}
            field={fieldsById[entry.fieldId]}
            key={entry.id}
            onAutoOpenDone={() => setAutoOpenId(null)}
            onPatch={(patch) => handlePatchCondition(entry.id, patch)}
            onRemove={() => handleRemoveEntry(entry.id)}
          />
        )
      )}
      {showAddTrigger ? (
        <AddFilterChip
          fields={fields}
          fullWidth={addFullWidth}
          onPick={handleAddField}
        />
      ) : null}
    </div>
  );
}

/**
 * The sort half of the chip bar: one chip per view sort in priority order.
 * Renders nothing when the view has no sorts. Reused by the desktop inline
 * bar and the mobile sort popover.
 */
export function DatabaseSortChips({
  className,
  databaseId,
  fields,
  view,
}: ChipStripProps): ReactNode {
  const fieldsById = useMemo(() => {
    const byId: Record<string, DatabaseField> = {};
    for (const field of fields) {
      byId[field.id] = field;
    }
    return byId;
  }, [fields]);

  const sorts = view.sorts ?? [];

  const applySortsChange = (next: readonly DatabaseSort[] | undefined) => {
    updateDatabaseView(databaseId, view.id, {
      sorts: next && next.length > 0 ? [...next] : undefined,
    });
  };

  const reorderSorts = (from: number, to: number) => {
    const next = [...sorts];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    applySortsChange(next);
  };

  const { containerRef, getHandleProps, state } = useListReorder(reorderSorts, {
    axis: "horizontal",
  });

  if (sorts.length === 0) {
    return null;
  }

  const canReorder = sorts.length > 1;
  const isReordering = state.fromIndex !== null;
  const lastIndex = sorts.length - 1;
  const isNoOpDrop =
    state.fromIndex !== null &&
    state.overIndex !== null &&
    resolveReorderTarget(state.fromIndex, state.overIndex) === state.fromIndex;
  const draggingSort =
    state.fromIndex === null ? null : (sorts[state.fromIndex] ?? null);
  const draggingFieldName =
    draggingSort === null
      ? null
      : (fieldsById[draggingSort.fieldId]?.name ?? "Unknown field");

  return (
    <>
      <div className={className} ref={canReorder ? containerRef : undefined}>
        {sorts.map((sort, index) => (
          <SortChip
            direction={sort.direction}
            dropAfter={
              canReorder &&
              isReordering &&
              !isNoOpDrop &&
              index === lastIndex &&
              state.overIndex === index + 1
            }
            dropBefore={
              canReorder &&
              isReordering &&
              !isNoOpDrop &&
              state.overIndex === index
            }
            fieldName={fieldsById[sort.fieldId]?.name ?? "Unknown field"}
            isDragging={canReorder && state.fromIndex === index}
            key={sort.fieldId}
            onFlip={() =>
              applySortsChange(flippedSortDirection(sorts, sort.fieldId))
            }
            onRemove={() => applySortsChange(withoutSort(sorts, sort.fieldId))}
            reorderHandleProps={canReorder ? getHandleProps(index) : undefined}
          />
        ))}
      </div>
      {state.preview && draggingSort && draggingFieldName
        ? createPortal(
            <SortChipDragPreview
              direction={draggingSort.direction}
              fieldName={draggingFieldName}
              preview={state.preview}
            />,
            document.body
          )
        : null}
    </>
  );
}

/**
 * Group-by chip: `[grid icon] Grouped by <field>` with a trailing × that
 * clears `view.groupBy` (and the collapse state with it). Renders nothing
 * when the view is ungrouped. Reused by the desktop inline bar and the
 * mobile sort popover.
 */
export function DatabaseGroupByChip({
  databaseId,
  fields,
  view,
}: Omit<ChipStripProps, "className">): ReactNode {
  const groupBy = view.groupBy;
  if (!groupBy) {
    return null;
  }
  const fieldName =
    fields.find((field) => field.id === groupBy.fieldId)?.name ??
    "Unknown field";

  return (
    <div className={CHIP_CLASS}>
      <span className={CHIP_SEGMENT_CLASS}>
        <IconLayoutGrid className="size-3.5 shrink-0 stroke-[1.5px]" />
        Grouped by
        <span className="max-w-32 truncate text-foreground">{fieldName}</span>
      </span>
      <RemoveChipButton
        label={`Clear grouping by ${fieldName}`}
        onRemove={() => {
          updateDatabaseView(databaseId, view.id, {
            groupBy: undefined,
            config: { ...view.config, collapsedGroupKeys: undefined },
          });
        }}
      />
    </div>
  );
}

/**
 * Match all/any control, shown only once the root filter group has two or
 * more entries. Kept separate from `DatabaseFilterChips` so the desktop bar
 * can place it after the sort chips (trailing, `ml-auto`) exactly as before.
 */
export function DatabaseFilterMatchOp({
  databaseId,
  view,
}: Pick<ChipStripProps, "databaseId" | "view">): ReactNode {
  const filter = view.filter;
  if (!filter || filter.conditions.length < 2) {
    return null;
  }

  return (
    <MatchOpControl
      onChange={(op) => {
        updateDatabaseView(databaseId, view.id, {
          filter: setFilterOp(filter, op),
        });
      }}
      op={filter.op}
    />
  );
}

interface DatabaseFilterBarProps {
  databaseId: string;
  fields: readonly DatabaseField[];
  /** Show the dashed "+ Filter" chip at the end of the filter strip. */
  showFilterAddTrigger?: boolean;
  /** Render filter condition chips (false when the title funnel hides them). */
  showFilterChips?: boolean;
  /** Show the dashed "+ Sort" chip (narrow viewport collapsible bar). */
  showSortAddTrigger?: boolean;
  view: DatabaseView;
}

/** Filter + sort chip bar for one database table view (desktop inline bar). */
export function DatabaseFilterBar({
  databaseId,
  fields,
  showFilterAddTrigger = false,
  showFilterChips = true,
  showSortAddTrigger = false,
  view,
}: DatabaseFilterBarProps): ReactNode {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {showFilterChips ? (
        <DatabaseFilterChips
          className="contents"
          databaseId={databaseId}
          fields={fields}
          showAddTrigger={showFilterAddTrigger}
          view={view}
        />
      ) : null}
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
      {showFilterChips ? (
        <DatabaseFilterMatchOp databaseId={databaseId} view={view} />
      ) : null}
      {showSortAddTrigger ? (
        <AddSortButton databaseId={databaseId} fields={fields} view={view} />
      ) : null}
    </div>
  );
}

interface FilterConditionChipProps {
  /** Open the value popover immediately on mount (fresh "+ Filter" chip). */
  autoOpenValue: boolean;
  condition: DatabaseFilterCondition;
  /** `undefined` for stale conditions referencing a deleted field. */
  field: DatabaseField | undefined;
  onAutoOpenDone: () => void;
  onPatch: (
    patch: Partial<Pick<DatabaseFilterCondition, "operator" | "value">>
  ) => void;
  onRemove: () => void;
}

/**
 * One `[field] [operator] [value] [×]` chip. The operator segment opens the
 * field type's operator menu; the value segment opens a per-type editor
 * popover; emptiness operators hide the value segment entirely.
 */
function FilterConditionChip({
  autoOpenValue,
  condition,
  field,
  onAutoOpenDone,
  onPatch,
  onRemove,
}: FilterConditionChipProps): ReactNode {
  const needsValue = operatorNeedsValue(condition.operator);
  const [valueOpen, setValueOpen] = useState(autoOpenValue && needsValue);

  if (!field) {
    // Stale condition (field deleted elsewhere): removable label only.
    return (
      <div className={CHIP_CLASS}>
        <span className={CHIP_SEGMENT_CLASS}>Unknown field</span>
        <RemoveChipButton label="Remove filter" onRemove={onRemove} />
      </div>
    );
  }

  const Icon = resolveFieldIcon(field);
  const valueLabel = conditionValueLabel(field, condition);

  const handleValueOpenChange = (open: boolean) => {
    setValueOpen(open);
    if (!open) {
      onAutoOpenDone();
    }
  };

  return (
    <div className={CHIP_CLASS}>
      <span className={CHIP_SEGMENT_CLASS}>
        <Icon className="size-3.5 shrink-0 stroke-[1.5px]" />
        <span className="max-w-32 truncate text-foreground">{field.name}</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button className={CHIP_BUTTON_CLASS} type="button">
              {operatorLabel(condition.operator)}
            </button>
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            onValueChange={(next) => {
              const operator = next as DatabaseFilterOperator;
              // The stored value survives only when the new operator both
              // takes one and reads the same shape (single scalar vs the
              // `between` `[startIso, endIso]` pair).
              const keepsValue =
                operatorNeedsValue(operator) &&
                operatorNeedsRange(operator) ===
                  operatorNeedsRange(condition.operator);
              onPatch(
                keepsValue ? { operator } : { operator, value: undefined }
              );
            }}
            value={condition.operator}
          >
            {FIELD_TYPE_DEFS[field.type].operators.map((operator) => (
              <DropdownMenuRadioItem key={operator} value={operator}>
                {operatorLabel(operator)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {needsValue ? (
        <Popover onOpenChange={handleValueOpenChange} open={valueOpen}>
          <PopoverTrigger
            render={
              <button className={CHIP_BUTTON_CLASS} type="button">
                {valueLabel === "" ? (
                  <span className="text-muted-foreground/70">Value</span>
                ) : (
                  <span className="max-w-40 truncate text-foreground">
                    {valueLabel}
                  </span>
                )}
              </button>
            }
          />
          <PopoverContent
            align="start"
            className={cn("p-2", field.type === "date" && "w-auto")}
          >
            <FilterValueEditor
              condition={condition}
              field={field}
              onClose={() => handleValueOpenChange(false)}
              onValueChange={(value) => onPatch({ value })}
            />
          </PopoverContent>
        </Popover>
      ) : null}
      <RemoveChipButton label="Remove filter" onRemove={onRemove} />
    </div>
  );
}

interface FilterValueEditorProps {
  condition: DatabaseFilterCondition;
  field: DatabaseField;
  onClose: () => void;
  onValueChange: (value: DatabaseCellValue | undefined) => void;
}

/** Per-field-type value editor rendered inside the chip's value popover. */
function FilterValueEditor({
  condition,
  field,
  onClose,
  onValueChange,
}: FilterValueEditorProps): ReactNode {
  switch (field.type) {
    case "text":
    case "url":
    // Formula columns filter as strings in v1 — the condition compares
    // against the computed value's text projection (see FIELD_TYPE_DEFS).
    case "formula":
      return (
        <FilterTextValueInput
          initial={typeof condition.value === "string" ? condition.value : ""}
          isNumber={false}
          onCommit={(raw, close) => {
            onValueChange(raw === "" ? undefined : raw);
            if (close) {
              onClose();
            }
          }}
        />
      );
    case "number":
      return (
        <FilterTextValueInput
          initial={
            typeof condition.value === "number" ? String(condition.value) : ""
          }
          isNumber
          onCommit={(raw, close) => {
            const parsed = Number.parseFloat(raw);
            onValueChange(Number.isFinite(parsed) ? parsed : undefined);
            if (close) {
              onClose();
            }
          }}
        />
      );
    case "select":
    case "multiSelect":
      return (
        <DatabaseOptionCombobox
          fieldId={field.id}
          multiple
          onToggleOption={(optionId) => {
            onValueChange(toggleConditionOptionId(condition.value, optionId));
          }}
          options={field.options}
          selectedIds={conditionOptionIds(condition.value)}
        />
      );
    case "checkbox":
      return (
        <CheckboxValueList
          checked={condition.value === true}
          onPick={(next) => {
            onValueChange(next);
            onClose();
          }}
        />
      );
    case "date": {
      if (operatorNeedsRange(condition.operator)) {
        return (
          <FilterDateRangeCalendar
            initialValue={condition.value}
            onCommit={(value) => {
              onValueChange(value);
              onClose();
            }}
          />
        );
      }
      const selected =
        typeof condition.value === "string"
          ? (isoDateToLocalDate(toIsoDatePart(condition.value)) ?? undefined)
          : undefined;
      return (
        <Calendar
          autoFocus
          defaultMonth={selected}
          mode="single"
          onSelect={(day) => {
            onValueChange(day ? format(day, "yyyy-MM-dd") : undefined);
            onClose();
          }}
          selected={selected}
        />
      );
    }
    default:
      return null;
  }
}

interface FilterTextValueInputProps {
  initial: string;
  isNumber: boolean;
  /** `close` is true for Enter, false for blur (popover stays open). */
  onCommit: (raw: string, close: boolean) => void;
}

/** Text/number condition value input — commits on Enter (closing) and blur. */
function FilterTextValueInput({
  initial,
  isNumber,
  onCommit,
}: FilterTextValueInputProps): ReactNode {
  const [draft, setDraft] = useState(initial);
  const focusSelectOnMount = useFocusOnMount({ select: true });
  // Set once Enter committed so the trailing blur doesn't commit twice.
  const finishedRef = useRef(false);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finishedRef.current = true;
      onCommit(draft.trim(), true);
    }
  };

  return (
    <InputGroup className="h-8">
      <InputGroupInput
        aria-label="Filter value"
        autoComplete="off"
        inputMode={isNumber ? "decimal" : undefined}
        onBlur={() => {
          if (!finishedRef.current) {
            onCommit(draft.trim(), false);
          }
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Value"
        ref={focusSelectOnMount}
        value={draft}
      />
    </InputGroup>
  );
}

/** `[startIso, endIso]` condition value parsed back to a calendar range. */
function conditionDateRange(
  value: DatabaseCellValue | undefined
): DateRange | undefined {
  if (!Array.isArray(value) || value.length !== 2) {
    return;
  }
  const from = isoDateToLocalDate(toIsoDatePart(value[0]));
  const to = isoDateToLocalDate(toIsoDatePart(value[1]));
  if (!(from && to)) {
    return;
  }
  return { from, to };
}

/**
 * Dual-date editor for `between` conditions: one Calendar in react-day-picker
 * range mode — first click sets the start, second the end (same-day click
 * yields a single-day range). Commits `[startIso, endIso]` and closes once
 * both ends are picked; a start-only selection keeps the popover open.
 */
function FilterDateRangeCalendar({
  initialValue,
  onCommit,
}: {
  initialValue: DatabaseCellValue | undefined;
  onCommit: (value: [string, string]) => void;
}): ReactNode {
  const [range, setRange] = useState<DateRange | undefined>(() =>
    conditionDateRange(initialValue)
  );
  return (
    <Calendar
      autoFocus
      defaultMonth={range?.from}
      mode="range"
      onSelect={(next) => {
        setRange(next);
        if (next?.from && next.to) {
          onCommit([
            format(next.from, "yyyy-MM-dd"),
            format(next.to, "yyyy-MM-dd"),
          ]);
        }
      }}
      selected={range}
    />
  );
}

const CHECKBOX_VALUE_ROWS = [
  { label: "Checked", value: true },
  { label: "Unchecked", value: false },
] as const;

/** True/false picker for checkbox conditions (unset counts as unchecked). */
function CheckboxValueList({
  checked,
  onPick,
}: {
  checked: boolean;
  onPick: (value: boolean) => void;
}): ReactNode {
  return (
    <div className="flex flex-col">
      {CHECKBOX_VALUE_ROWS.map((row) => (
        <button
          className="flex h-8 pointer-coarse:h-10 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
          key={row.label}
          onClick={() => onPick(row.value)}
          type="button"
        >
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
          {checked === row.value ? (
            <IconCheck className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Read-only chip for an inner group already present in view data. */
function FilterGroupChip({
  group,
  onRemove,
}: {
  group: DatabaseFilterInnerGroup;
  onRemove: () => void;
}): ReactNode {
  return (
    <div className={CHIP_CLASS}>
      <span className={CHIP_SEGMENT_CLASS}>{innerGroupChipLabel(group)}</span>
      <RemoveChipButton label="Remove filter group" onRemove={onRemove} />
    </div>
  );
}

/** Trailing × segment shared by every chip. */
function RemoveChipButton({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}): ReactNode {
  return (
    <button
      aria-label={label}
      className={cn(CHIP_BUTTON_CLASS, "px-1")}
      onClick={onRemove}
      type="button"
    >
      <IconX className="size-3.5 stroke-[1.5px]" />
    </button>
  );
}

/** "+ Filter" chip opening the type-ahead field picker. */
/**
 * Shared field type-ahead popover behind the "+ Filter" and "+ Sort" add
 * triggers: a search input + field list. `trigger` is the element the popover
 * anchors to (small chip or full-width button). In drawer presentation the
 * list drops its own max-height so the single outer drawer scroller owns
 * scrolling (vaul at-top drag-to-dismiss contract).
 */
function FieldPickerPopover({
  fields,
  onPick,
  placeholder,
  trigger,
}: {
  fields: readonly DatabaseField[];
  onPick: (field: DatabaseField) => void;
  placeholder: string;
  trigger: ReactElement;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const focusOnMount = useFocusOnMount();
  const [query, setQuery] = useState("");
  const isDrawer = useResolvedMenuPresentation() === "drawer";
  const trimmed = query.trim().toLowerCase();

  const filtered =
    trimmed === ""
      ? [...fields]
      : fields.filter((field) => field.name.toLowerCase().includes(trimmed));

  const pick = (field: DatabaseField) => {
    onPick(field);
    setOpen(false);
  };

  return (
    <Popover
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (next) {
          setQuery("");
        }
      }}
      open={open}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex flex-col gap-1.5">
          <InputGroup className="h-8">
            <InputGroupAddon align="inline-start">
              <InputGroupText>
                <IconSearch />
              </InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search fields"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter" && filtered[0]) {
                  event.preventDefault();
                  pick(filtered[0]);
                }
              }}
              placeholder={placeholder}
              ref={focusOnMount}
              value={query}
            />
          </InputGroup>
          <div
            className={cn(
              "flex flex-col",
              isDrawer ? undefined : "max-h-56 overflow-y-auto"
            )}
          >
            {filtered.map((field) => {
              const Icon = resolveFieldIcon(field);
              return (
                <button
                  className="flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                  key={field.id}
                  onClick={() => pick(field)}
                  type="button"
                >
                  <Icon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{field.name}</span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-muted-foreground text-sm">
                No fields found
              </div>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Plain field list dropdown for title-row filter/sort icon triggers. */
export function FieldPickerDropdown({
  emptyLabel = "No properties",
  fields,
  onPick,
  trigger,
}: {
  emptyLabel?: string;
  fields: readonly DatabaseField[];
  onPick: (field: DatabaseField) => void;
  trigger: ReactElement;
}): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" className="w-56">
        {fields.map((field) => {
          const Icon = resolveFieldIcon(field);
          return (
            <DropdownMenuItem key={field.id} onClick={() => onPick(field)}>
              <Icon className="size-4 stroke-[1.5px] text-muted-foreground" />
              {field.name}
            </DropdownMenuItem>
          );
        })}
        {fields.length === 0 ? (
          <div className="px-2 py-1.5 text-muted-foreground text-sm">
            {emptyLabel}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Dashed add trigger element for `FieldPickerPopover`'s `render` prop — a raw
 * `<button>` (not a component wrapper) so Base UI can clone the popover's
 * onClick/ref onto it. Small inline chip, or full-width for the drawers.
 */
function addTriggerButton(fullWidth: boolean, label: string): ReactElement {
  return (
    <button
      className={fullWidth ? ADD_FULL_WIDTH_CLASS : ADD_CHIP_CLASS}
      type="button"
    >
      <IconPlus
        className={cn("stroke-[1.5px]", fullWidth ? "size-4" : "size-3.5")}
      />
      {label}
    </button>
  );
}

function AddFilterChip({
  fields,
  fullWidth = false,
  onPick,
}: {
  fields: readonly DatabaseField[];
  fullWidth?: boolean;
  onPick: (field: DatabaseField) => void;
}): ReactNode {
  return (
    <FieldPickerPopover
      fields={fields}
      onPick={onPick}
      placeholder="Filter by…"
      trigger={addTriggerButton(fullWidth, fullWidth ? "Add filter" : "Filter")}
    />
  );
}

/**
 * "+ Sort" add trigger: picks a field and appends an ascending sort to the
 * view (already-sorted fields drop out of the picker). Standalone so the
 * mobile sort drawer can offer adding a sort without the column header menu.
 */
export function AddSortButton({
  databaseId,
  fields,
  fullWidth = false,
  view,
}: ChipStripProps & { fullWidth?: boolean }): ReactNode {
  const sorts = view.sorts ?? [];
  const sortedIds = new Set(sorts.map((sort) => sort.fieldId));
  const available = fields.filter((field) => !sortedIds.has(field.id));

  const handlePick = (field: DatabaseField) => {
    updateDatabaseView(databaseId, view.id, {
      sorts: [...sorts, { fieldId: field.id, direction: "asc" }],
    });
  };

  return (
    <FieldPickerPopover
      fields={available}
      onPick={handlePick}
      placeholder="Sort by…"
      trigger={addTriggerButton(fullWidth, fullWidth ? "Add sort" : "Sort")}
    />
  );
}

/** Root group and/or toggle, shown once two or more root entries exist. */
function MatchOpControl({
  onChange,
  op,
}: {
  onChange: (op: DatabaseFilterGroupOp) => void;
  op: DatabaseFilterGroupOp;
}): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="ml-auto flex h-6 pointer-coarse:h-8 shrink-0 items-center gap-1 rounded-md pointer-coarse:px-2 px-1.5 text-muted-foreground text-xs outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
            type="button"
          >
            {op === "and" ? "Match all filters" : "Match any filter"}
            <IconChevronDown className="size-3.5 stroke-[1.5px]" />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          onValueChange={(next) => onChange(next as DatabaseFilterGroupOp)}
          value={op}
        >
          <DropdownMenuRadioItem value="and">
            Match all filters
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="or">
            Match any filter
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SortChipProps {
  direction: "asc" | "desc";
  dropAfter: boolean;
  dropBefore: boolean;
  fieldName: string;
  isDragging: boolean;
  onFlip: () => void;
  onRemove: () => void;
  reorderHandleProps?: ListReorderHandleProps;
}

/** Vertical drop indicator for horizontal sort-chip reorder. */
function SortDropLine({ position }: { position: "left" | "right" }): ReactNode {
  return (
    <div
      className={cn(
        "pointer-events-none absolute -inset-y-1 z-20 w-0.5 rounded-full bg-selection-primary",
        position === "left" ? "-left-1" : "-right-1"
      )}
    />
  );
}

/** Static chip body shared by the inline sort chip and its drag preview. */
function SortChipBody({
  direction,
  fieldName,
}: {
  direction: "asc" | "desc";
  fieldName: string;
}): ReactNode {
  const Arrow = direction === "asc" ? IconArrowUp : IconArrowDown;
  return (
    <>
      <span className={CHIP_SEGMENT_CLASS}>
        <span className="max-w-32 truncate text-foreground">{fieldName}</span>
      </span>
      <span
        aria-hidden
        className={cn(CHIP_SEGMENT_CLASS, "px-1 text-muted-foreground")}
      >
        <Arrow className="size-3.5 stroke-[1.5px]" />
      </span>
    </>
  );
}

/** Follow-the-pointer clone of the chip under drag. */
function SortChipDragPreview({
  direction,
  fieldName,
  preview,
}: {
  direction: "asc" | "desc";
  fieldName: string;
  preview: ListReorderDragPreview;
}): ReactNode {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-9999"
      data-sort-chip-drag-preview=""
      style={{
        transform: `translate3d(${preview.clientX - preview.offsetX}px, ${preview.clientY - preview.offsetY}px, 0)`,
        width: preview.width > 0 ? preview.width : undefined,
      }}
    >
      <div
        className={cn(
          CHIP_CLASS,
          "cursor-grabbing shadow-md ring-1 ring-border"
        )}
      >
        <SortChipBody direction={direction} fieldName={fieldName} />
      </div>
    </div>
  );
}

/**
 * One sort chip, rendered per view sort in priority order: field name (drag
 * handle when multi-sort), a direction-arrow button that flips the sort, and ×
 * removing just this sort. Adding sorts lives in the column menu.
 */
function SortChip({
  direction,
  dropAfter,
  dropBefore,
  fieldName,
  isDragging,
  onFlip,
  onRemove,
  reorderHandleProps,
}: SortChipProps): ReactNode {
  const fieldLabel = (
    <span className="max-w-32 truncate text-foreground">{fieldName}</span>
  );
  return (
    <div className="relative shrink-0" data-reorder-item="">
      {dropBefore ? <SortDropLine position="left" /> : null}
      {dropAfter ? <SortDropLine position="right" /> : null}
      <div className={cn(CHIP_CLASS, isDragging && "invisible")}>
        {reorderHandleProps ? (
          <button
            aria-label={`Reorder sort by ${fieldName}`}
            className={cn(
              CHIP_SEGMENT_CLASS,
              "cursor-grab touch-none active:cursor-grabbing"
            )}
            type="button"
            {...reorderHandleProps}
          >
            {fieldLabel}
          </button>
        ) : (
          <span className={CHIP_SEGMENT_CLASS}>{fieldLabel}</span>
        )}
        <SortChipDirectionButton
          direction={direction}
          fieldName={fieldName}
          onFlip={onFlip}
        />
        <RemoveChipButton
          label={`Remove sort by ${fieldName}`}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}

function SortChipDirectionButton({
  direction,
  fieldName,
  onFlip,
}: {
  direction: "asc" | "desc";
  fieldName: string;
  onFlip: () => void;
}): ReactNode {
  const Arrow = direction === "asc" ? IconArrowUp : IconArrowDown;
  return (
    <button
      aria-label={`Sort ${fieldName} ${
        direction === "asc" ? "descending" : "ascending"
      }`}
      className={cn(CHIP_BUTTON_CLASS, "px-1")}
      onClick={onFlip}
      type="button"
    >
      <Arrow className="size-3.5 stroke-[1.5px]" />
    </button>
  );
}
