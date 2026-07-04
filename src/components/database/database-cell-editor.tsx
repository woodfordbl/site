import { format } from "date-fns/format";
import {
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type CellEditMove,
  type CellEditTarget,
  isoDateToLocalDate,
  parseNumberCellInput,
} from "@/components/database/database-grid-helpers.ts";
import { DatabaseOptionCombobox } from "@/components/database/database-option-combobox.tsx";
import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import { Button } from "@/components/ui/button.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { localDatabaseRowsCollection } from "@/db/collections/local-collections.ts";
import {
  updateDatabaseCell,
  updateDatabaseField,
} from "@/db/queries/database-collection-ops.ts";
import { coerceCellValue, toIsoDatePart } from "@/lib/databases/cell-values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseSelectOption,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Inline cell editors, keyed by field type: a borderless input overlay for
 * text/url/number, popover editors for select/multi-select (searchable option
 * combobox with option creation) and date (calendar), and an in-place
 * checkbox toggle. All writes go through `updateDatabaseCell`; new select
 * options append to the field schema via `updateDatabaseField`.
 */

function initialDraft(
  field: DatabaseField,
  value: DatabaseCellValue | undefined
): string {
  const coerced = coerceCellValue(field, value);
  if (field.type === "number") {
    return typeof coerced === "number" ? String(coerced) : "";
  }
  return typeof coerced === "string" ? coerced : "";
}

interface DatabaseCellInlineEditorProps {
  field: DatabaseField;
  /** Move edit focus after a commit (Tab/Shift+Tab/Enter). */
  onNavigate: (move: CellEditMove, from: CellEditTarget) => void;
  /** Leave edit mode without moving (blur commit, Escape revert). */
  onStopEdit: () => void;
  rowId: string;
  value: DatabaseCellValue | undefined;
}

/**
 * The editing-state cell editor the grid mounts for every editable field
 * type: select/multi-select and date get popover editors anchored to the
 * cell (opening immediately, closing back to `onStopEdit`); everything else
 * gets the borderless input overlay.
 */
export function DatabaseCellInlineEditor({
  field,
  onNavigate,
  onStopEdit,
  rowId,
  value,
}: DatabaseCellInlineEditorProps): ReactNode {
  switch (field.type) {
    case "select":
    case "multiSelect":
      return (
        <SelectCellPopoverEditor
          field={field}
          onStopEdit={onStopEdit}
          rowId={rowId}
          value={value}
        />
      );
    case "date":
      return (
        <DateCellPopoverEditor
          field={field}
          onStopEdit={onStopEdit}
          rowId={rowId}
          value={value}
        />
      );
    default:
      return (
        <TextCellInlineEditor
          field={field}
          onNavigate={onNavigate}
          onStopEdit={onStopEdit}
          rowId={rowId}
          value={value}
        />
      );
  }
}

/**
 * Borderless input overlay filling a text/url/number cell. Commits through
 * `updateDatabaseCell` on blur/Enter/Tab; Escape reverts without writing.
 * EditableSurface philosophy: native input, transparent chrome, only a subtle
 * inset ring marks the editing cell.
 */
function TextCellInlineEditor({
  field,
  onNavigate,
  onStopEdit,
  rowId,
  value,
}: DatabaseCellInlineEditorProps): ReactNode {
  const initial = initialDraft(field, value);
  const [draft, setDraft] = useState(initial);
  const focusOnMount = useFocusOnMount({ select: true });
  // Set once Enter/Tab/Escape handled the exit so the trailing blur is a no-op.
  const finishedRef = useRef(false);
  const isNumber = field.type === "number";

  const commit = () => {
    if (draft === initial) {
      return;
    }
    if (isNumber) {
      updateDatabaseCell(rowId, field.id, parseNumberCellInput(draft));
      return;
    }
    updateDatabaseCell(rowId, field.id, draft === "" ? null : draft);
  };

  const finish = (move?: CellEditMove) => {
    finishedRef.current = true;
    commit();
    if (move) {
      onNavigate(move, { rowId, fieldId: field.id });
      return;
    }
    onStopEdit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish("down");
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      finish(event.shiftKey ? "previous" : "next");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      finishedRef.current = true;
      onStopEdit();
    }
  };

  return (
    <input
      aria-label={field.name}
      className={cn(
        "absolute inset-0 z-10 size-full rounded-none border-none bg-background px-2 font-normal text-foreground text-sm outline-none ring-1 ring-border ring-inset placeholder:text-muted-foreground",
        isNumber && "text-right tabular-nums"
      )}
      inputMode={isNumber ? "decimal" : undefined}
      onBlur={() => {
        if (finishedRef.current) {
          return;
        }
        finishedRef.current = true;
        commit();
        onStopEdit();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      ref={focusOnMount}
      type="text"
      value={draft}
    />
  );
}

interface CellEditorPopoverProps {
  children: ReactNode;
  className?: string;
  onStopEdit: () => void;
}

/**
 * Popover shell for cell editors: an invisible full-cell anchor marks the
 * editing cell with an inset ring, the popover opens immediately beneath it,
 * and any dismissal (Escape, outside click) exits editing via `onStopEdit`.
 */
function CellEditorPopover({
  children,
  className,
  onStopEdit,
}: CellEditorPopoverProps): ReactNode {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 ring-1 ring-border ring-inset"
        ref={setAnchor}
      />
      <Popover
        onOpenChange={(open: boolean) => {
          if (!open) {
            onStopEdit();
          }
        }}
        // Open as soon as the anchor exists so positioning never flashes.
        open={anchor !== null}
      >
        <PopoverContent
          align="start"
          anchor={anchor}
          className={className}
          side="bottom"
          sideOffset={2}
        >
          {children}
        </PopoverContent>
      </Popover>
    </>
  );
}

interface SelectCellPopoverEditorProps {
  field: Extract<DatabaseField, { type: "select" | "multiSelect" }>;
  onStopEdit: () => void;
  rowId: string;
  value: DatabaseCellValue | undefined;
}

/**
 * Select/multi-select popover combobox. Single select commits and closes on
 * pick (re-picking the current option clears it); multi-select toggles and
 * stays open, selected options shown as pills atop the list. Unmatched
 * queries offer a "Create" row appending an option to the field schema.
 */
function SelectCellPopoverEditor({
  field,
  onStopEdit,
  rowId,
  value,
}: SelectCellPopoverEditorProps): ReactNode {
  const multiple = field.type === "multiSelect";
  const coerced = coerceCellValue(field, value);

  const selectedIds = useMemo<string[]>(() => {
    if (multiple) {
      return Array.isArray(coerced) ? coerced : [];
    }
    return typeof coerced === "string" && coerced !== "" ? [coerced] : [];
  }, [coerced, multiple]);

  const commitIds = (ids: string[]) => {
    if (multiple) {
      updateDatabaseCell(rowId, field.id, ids.length > 0 ? ids : null);
      return;
    }
    updateDatabaseCell(rowId, field.id, ids[0] ?? null);
  };

  const handleToggle = (optionId: string) => {
    if (multiple) {
      commitIds(
        selectedIds.includes(optionId)
          ? selectedIds.filter((id) => id !== optionId)
          : [...selectedIds, optionId]
      );
      return;
    }
    commitIds(selectedIds[0] === optionId ? [] : [optionId]);
    onStopEdit();
  };

  const handleCreate = (name: string) => {
    // The row is guaranteed present while its cell is editing; point-read its
    // databaseId to address the schema update.
    const databaseId = localDatabaseRowsCollection.get(rowId)?.databaseId;
    if (!databaseId) {
      return;
    }
    const option: DatabaseSelectOption = { id: crypto.randomUUID(), name };
    // `Omit` over the field union keeps only shared keys, so the per-variant
    // `options` patch needs an assertion; the field is select-typed here.
    updateDatabaseField(databaseId, field.id, {
      options: [...field.options, option],
    } as Partial<Omit<DatabaseField, "id">>);
    if (multiple) {
      commitIds([...selectedIds, option.id]);
      return;
    }
    commitIds([option.id]);
    onStopEdit();
  };

  return (
    <CellEditorPopover onStopEdit={onStopEdit}>
      <DatabaseOptionCombobox
        multiple={multiple}
        onCreateOption={handleCreate}
        onToggleOption={handleToggle}
        options={field.options}
        selectedIds={selectedIds}
      />
    </CellEditorPopover>
  );
}

interface DateCellPopoverEditorProps {
  field: DatabaseField;
  onStopEdit: () => void;
  rowId: string;
  value: DatabaseCellValue | undefined;
}

/**
 * Date popover editor: single-date calendar storing the ISO `yyyy-mm-dd`
 * date part, with a Clear action emptying the cell.
 */
function DateCellPopoverEditor({
  field,
  onStopEdit,
  rowId,
  value,
}: DateCellPopoverEditorProps): ReactNode {
  const coerced = coerceCellValue(field, value);
  const selected =
    typeof coerced === "string"
      ? (isoDateToLocalDate(toIsoDatePart(coerced)) ?? undefined)
      : undefined;

  return (
    <CellEditorPopover className="w-auto" onStopEdit={onStopEdit}>
      <Calendar
        autoFocus
        defaultMonth={selected}
        mode="single"
        onSelect={(day) => {
          updateDatabaseCell(
            rowId,
            field.id,
            day ? format(day, "yyyy-MM-dd") : null
          );
          onStopEdit();
        }}
        selected={selected}
      />
      <Button
        className="justify-center"
        onClick={() => {
          updateDatabaseCell(rowId, field.id, null);
          onStopEdit();
        }}
        size="sm"
        variant="ghost"
      >
        Clear
      </Button>
    </CellEditorPopover>
  );
}

interface DatabaseCheckboxCellEditorProps {
  /** Read-only render (synced fields) — the checkbox shows but never writes. */
  disabled?: boolean;
  field: DatabaseField;
  rowId: string;
  value: DatabaseCellValue | undefined;
}

/**
 * Edit-mode checkbox cell — toggles the stored boolean directly. The hit area
 * expands to the whole cell (the `after` overlay anchors to the relative
 * gridcell): a bare 16px checkbox is untappable on coarse pointers.
 */
export function DatabaseCheckboxCellEditor({
  disabled = false,
  field,
  rowId,
  value,
}: DatabaseCheckboxCellEditorProps): ReactNode {
  const checked = coerceCellValue(field, value) === true;
  return (
    <Checkbox
      aria-label={field.name}
      checked={checked}
      className="static after:absolute after:inset-0"
      disabled={disabled}
      onCheckedChange={(next) => {
        updateDatabaseCell(rowId, field.id, next === true);
      }}
    />
  );
}
