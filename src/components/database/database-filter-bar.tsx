import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { format } from "date-fns/format";
import {
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";

import { DATABASE_FIELD_TYPE_ICONS } from "@/components/database/database-field-icons.ts";
import {
  appendFilterCondition,
  conditionOptionIds,
  conditionValueLabel,
  innerGroupChipLabel,
  isFilterInnerGroup,
  patchFilterCondition,
  removeFilterEntry,
  setFilterOp,
  toggleConditionOptionId,
} from "@/components/database/database-filter-helpers.ts";
import { isoDateToLocalDate } from "@/components/database/database-grid-helpers.ts";
import { DatabaseOptionCombobox } from "@/components/database/database-option-combobox.tsx";
import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import { Calendar } from "@/components/ui/calendar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
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
  DatabaseView,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Linear-style filter chip bar rendered between the database title and the
 * grid (edit mode only). One chip per root-level condition — field, operator,
 * and value are separate click targets editing in place via popovers — plus a
 * "+ Filter" type-ahead field picker, a Match all/any control once two or
 * more root entries exist, and sort-indicator chips while the view is sorted.
 *
 * Deferred (per §5.2 of the databases proposal):
 * - All writes mutate the saved view directly through `updateDatabaseView`;
 *   the ephemeral-vs-saved filter split ("Save to view / Reset") comes later.
 * - Inner groups already present in data render as read-only bracketed chips
 *   with a remove action; creating/editing groups via UI arrives later.
 */

const CHIP_CLASS =
  "flex h-6 shrink-0 items-stretch divide-x divide-border overflow-hidden rounded-md border border-border bg-background text-xs";

const CHIP_SEGMENT_CLASS =
  "flex items-center gap-1 px-1.5 text-muted-foreground outline-none transition-colors";

const CHIP_BUTTON_CLASS = cn(
  CHIP_SEGMENT_CLASS,
  "hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
);

interface DatabaseFilterBarProps {
  databaseId: string;
  fields: readonly DatabaseField[];
  view: DatabaseView;
}

/** Filter + sort chip bar for one database table view. */
export function DatabaseFilterBar({
  databaseId,
  fields,
  view,
}: DatabaseFilterBarProps): ReactNode {
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

  const handleRemoveSort = (fieldId: string) => {
    const sorts = (view.sorts ?? []).filter((sort) => sort.fieldId !== fieldId);
    updateDatabaseView(databaseId, view.id, {
      sorts: sorts.length > 0 ? sorts : undefined,
    });
  };

  const rootEntries = view.filter?.conditions ?? [];

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
      <AddFilterChip fields={fields} onPick={handleAddField} />
      {(view.sorts ?? []).map((sort) => (
        <SortChip
          direction={sort.direction}
          fieldName={fieldsById[sort.fieldId]?.name ?? "Unknown field"}
          key={sort.fieldId}
          onRemove={() => handleRemoveSort(sort.fieldId)}
        />
      ))}
      {view.filter && rootEntries.length >= 2 ? (
        <MatchOpControl
          onChange={(op) => {
            if (view.filter) {
              applyFilterChange(setFilterOp(view.filter, op));
            }
          }}
          op={view.filter.op}
        />
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

  const Icon = DATABASE_FIELD_TYPE_ICONS[field.type];
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
              onPatch(
                operatorNeedsValue(operator)
                  ? { operator }
                  : { operator, value: undefined }
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
          className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
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
function AddFilterChip({
  fields,
  onPick,
}: {
  fields: readonly DatabaseField[];
  onPick: (field: DatabaseField) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const focusOnMount = useFocusOnMount();
  const [query, setQuery] = useState("");
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
      <PopoverTrigger
        render={
          <button
            className="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border border-dashed px-1.5 text-muted-foreground text-xs outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
            type="button"
          >
            <IconPlus className="size-3.5 stroke-[1.5px]" />
            Filter
          </button>
        }
      />
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
              placeholder="Filter by…"
              ref={focusOnMount}
              value={query}
            />
          </InputGroup>
          <div className="flex max-h-56 flex-col overflow-y-auto">
            {filtered.map((field) => {
              const Icon = DATABASE_FIELD_TYPE_ICONS[field.type];
              return (
                <button
                  className="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
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
            className="ml-auto flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-muted-foreground text-xs outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
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

/** Sort indicator chip — the full sort UI lives in the column menu. */
function SortChip({
  direction,
  fieldName,
  onRemove,
}: {
  direction: "asc" | "desc";
  fieldName: string;
  onRemove: () => void;
}): ReactNode {
  const Arrow = direction === "asc" ? IconArrowUp : IconArrowDown;
  return (
    <div className={CHIP_CLASS}>
      <span className={CHIP_SEGMENT_CLASS}>
        <Arrow className="size-3.5 shrink-0 stroke-[1.5px]" />
        <span className="max-w-32 truncate text-foreground">{fieldName}</span>
      </span>
      <RemoveChipButton label="Remove sort" onRemove={onRemove} />
    </div>
  );
}
