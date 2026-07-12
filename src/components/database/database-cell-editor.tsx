import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { IconCheck, IconSearch } from "@tabler/icons-react";
import { format } from "date-fns/format";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { useResolvedMenuPresentation } from "@/components/ui/menu-presentation.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { localDatabaseRowsCollection } from "@/db/collections/local-collections.ts";
import {
  updateDatabaseCell,
  updateDatabaseField,
} from "@/db/queries/database-collection-ops.ts";
import { useDatabase, useDatabaseRows } from "@/db/queries/use-database.ts";
import {
  cellToPlainText,
  coerceCellValue,
  toIsoDatePart,
} from "@/lib/databases/cell-values.ts";
import { compareManualOrder } from "@/lib/databases/row-sort.ts";
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
  /**
   * Rendered cell width in px — decides inline vs overflow-popover editing for
   * text/url. Omitted on wide, non-clipping surfaces (the row page's property
   * panel), which always edit inline.
   */
  width?: number;
}

/**
 * Cells at or above this width edit inline in place; narrower ones are too
 * cramped to type/read in, so text/url open the aligned overflow popover
 * instead (which grows past the cell's clip).
 */
const POPOVER_OVERFLOW_THRESHOLD_PX = 240;

/**
 * The editing-state cell editor the grid mounts for every editable field
 * type: select/multi-select and date get popover editors anchored to the
 * cell; number keeps the borderless numeric input overlay. Text/url edit
 * inline in place, escaping to the auto-growing overflow popover only when
 * the cell is too narrow (`POPOVER_OVERFLOW_THRESHOLD_PX`) to type in.
 */
export function DatabaseCellInlineEditor({
  field,
  onNavigate,
  onStopEdit,
  rowId,
  value,
  // Default to inline: surfaces that don't clip (row property panel) omit it.
  width = POPOVER_OVERFLOW_THRESHOLD_PX,
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
    case "relation":
      return (
        <RelationCellPopoverEditor
          field={field}
          onStopEdit={onStopEdit}
          rowId={rowId}
          value={value}
        />
      );
    default:
      // Number always edits inline; text/url edit inline unless the cell is
      // too narrow, in which case the aligned overflow popover gives room.
      if (field.type === "number" || width >= POPOVER_OVERFLOW_THRESHOLD_PX) {
        return (
          <TextCellInlineEditor
            field={field}
            onNavigate={onNavigate}
            onStopEdit={onStopEdit}
            rowId={rowId}
            value={value}
            width={width}
          />
        );
      }
      return (
        <TextCellPopoverEditor
          field={field}
          onNavigate={onNavigate}
          onStopEdit={onStopEdit}
          rowId={rowId}
          value={value}
          width={width}
        />
      );
  }
}

/**
 * Borderless input overlay filling the cell — number cells (right-aligned,
 * tabular) and text/url cells wide enough to type in place. Commits through
 * `updateDatabaseCell` on blur/Enter/Tab; Escape reverts without writing.
 * EditableSurface philosophy: native input, transparent chrome, no selection
 * ring on the cell. Narrow text/url cells route through
 * `TextCellPopoverEditor` instead so the editor escapes the cell's clip.
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
        "absolute inset-0 z-10 size-full rounded-none border-none bg-background px-2 font-normal text-foreground text-sm outline-none placeholder:text-muted-foreground",
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

/** Cap the auto-growing text editor so a huge value scrolls instead of filling the viewport. */
const MAX_TEXT_EDITOR_HEIGHT_PX = 320;

/** Grow a textarea to fit its content, capped at `MAX_TEXT_EDITOR_HEIGHT_PX`. */
function autosizeTextarea(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_TEXT_EDITOR_HEIGHT_PX)}px`;
}

/**
 * Text/url cell editor that escapes the cell's `overflow-hidden` clip via a
 * portaled popover perfectly aligned to the cell: a zero-height anchor pinned
 * to the cell's top edge makes the popover open flush with the cell's top-left
 * corner (`side="bottom"`, `align="start"`, no offset), matching the cell width
 * (`--anchor-width`) with a comfortable minimum, then growing wider and taller
 * as the value overflows. Uses the Base UI primitive directly rather than the
 * shared `Popover` wrapper so it stays an aligned popover on touch devices too
 * (the wrapper swaps to a bottom drawer, which would break the alignment).
 * Commits on blur/Enter/Tab; Escape reverts. Enter commits and moves down —
 * these are single-line database strings, so newlines are never inserted.
 */
function TextCellPopoverEditor({
  field,
  onNavigate,
  onStopEdit,
  rowId,
  value,
}: DatabaseCellInlineEditorProps): ReactNode {
  const initial = initialDraft(field, value);
  const [draft, setDraft] = useState(initial);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Set once an exit path has run so the trailing blur/close is a no-op.
  const finishedRef = useRef(false);

  // Focus/select/size the textarea the moment it attaches — the popover only
  // mounts it once `anchor` is set (a render after this component mounts), so a
  // mount effect would fire too early to see it. A `useCallback([])` identity is
  // invoked only on attach/detach, never on the re-renders each keystroke
  // triggers (which would re-select and eat characters).
  const initTextarea = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    if (node) {
      node.focus();
      node.select();
      autosizeTextarea(node);
    }
  }, []);

  const commit = () => {
    if (draft === initial) {
      return;
    }
    updateDatabaseCell(rowId, field.id, draft === "" ? null : draft);
  };

  const finish = (move?: CellEditMove) => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    commit();
    if (move) {
      onNavigate(move, { rowId, fieldId: field.id });
      return;
    }
    onStopEdit();
  };

  const cancel = () => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    onStopEdit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
      cancel();
    }
  };

  return (
    <>
      {/* Zero-height anchor at the cell's top edge → popover opens flush with it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0"
        ref={setAnchor}
      />
      <PopoverPrimitive.Root
        onOpenChange={(open: boolean) => {
          // Escape is handled on the textarea (reverting); any other dismissal
          // (outside press) commits. `finishedRef` dedupes the trailing blur.
          if (!open) {
            finish();
          }
        }}
        // Open as soon as the anchor exists so positioning never flashes.
        open={anchor !== null}
      >
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            align="start"
            anchor={anchor}
            className="isolate z-50"
            side="bottom"
            sideOffset={0}
          >
            <PopoverPrimitive.Popup
              className="overlay-popover-surface flex w-[max(var(--anchor-width),16rem)] max-w-[min(var(--available-width),32rem)] flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
              finalFocus={false}
              initialFocus={textareaRef}
            >
              <textarea
                aria-label={field.name}
                className="min-h-9 w-full resize-none bg-transparent px-2 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground"
                onBlur={() => finish()}
                onChange={(event) => {
                  setDraft(event.target.value);
                  autosizeTextarea(event.currentTarget);
                }}
                onKeyDown={handleKeyDown}
                ref={initTextarea}
                rows={1}
                value={draft}
              />
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  );
}

interface CellEditorPopoverProps {
  children: ReactNode;
  className?: string;
  onStopEdit: () => void;
}

/**
 * Popover shell for cell editors: an invisible full-cell anchor the popover
 * opens immediately beneath, with any dismissal (Escape, outside click)
 * exiting editing via `onStopEdit`. The anchor carries no selection ring —
 * the open popover alone marks the editing cell.
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
        className="pointer-events-none absolute inset-0 z-10"
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
        fieldId={field.id}
        multiple={multiple}
        onCreateOption={handleCreate}
        onToggleOption={handleToggle}
        options={field.options}
        selectedIds={selectedIds}
      />
    </CellEditorPopover>
  );
}

interface RelationCellPopoverEditorProps {
  field: Extract<DatabaseField, { type: "relation" }>;
  onStopEdit: () => void;
  rowId: string;
  value: DatabaseCellValue | undefined;
}

/** One target row offered by the relation editor's searchable list. */
interface RelationRowEntry {
  id: string;
  title: string;
}

/**
 * Relation popover editor — the structural analog of the multi-select
 * combobox over the TARGET database's rows: searchable by title (the target's
 * primary field; blank titles read "Untitled"), checkbox-style multi-toggle
 * writing a target-row id array through `updateDatabaseCell`. Rows list in
 * manual order (`compareManualOrder`); synced target rows (`pageId` null)
 * list like any other. No create-row affordance in v1.
 */
function RelationCellPopoverEditor({
  field,
  onStopEdit,
  rowId,
  value,
}: RelationCellPopoverEditorProps): ReactNode {
  const coerced = coerceCellValue(field, value);
  const selectedIds = useMemo<string[]>(
    () => (Array.isArray(coerced) ? coerced : []),
    [coerced]
  );
  const targetDatabase = useDatabase(field.targetDatabaseId);
  const targetRows = useDatabaseRows(field.targetDatabaseId);

  const entries = useMemo<RelationRowEntry[]>(() => {
    const primaryField = targetDatabase?.fields.find(
      (entry) => entry.id === targetDatabase.primaryFieldId
    );
    if (!primaryField) {
      return [];
    }
    return [...targetRows].sort(compareManualOrder).map((row) => {
      const title = cellToPlainText(
        primaryField,
        row.values[primaryField.id]
      ).trim();
      return { id: row.id, title: title === "" ? "Untitled" : title };
    });
  }, [targetDatabase, targetRows]);

  const handleToggle = (targetRowId: string) => {
    const next = selectedIds.includes(targetRowId)
      ? selectedIds.filter((id) => id !== targetRowId)
      : [...selectedIds, targetRowId];
    updateDatabaseCell(rowId, field.id, next.length > 0 ? next : null);
  };

  return (
    <CellEditorPopover onStopEdit={onStopEdit}>
      <RelationRowCombobox
        entries={entries}
        onToggle={handleToggle}
        selectedIds={selectedIds}
      />
    </CellEditorPopover>
  );
}

interface RelationRowComboboxProps {
  entries: readonly RelationRowEntry[];
  onToggle: (rowId: string) => void;
  selectedIds: readonly string[];
}

/** Row class shared with the option combobox's list rows (same affordances). */
const RELATION_ROW_CLASS =
  "flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted";

/**
 * Search-first target-row list for the relation editor: type-ahead title
 * filtering, check marks on linked rows, toggling keeps the popover open
 * (multi-value). Mirrors `DatabaseOptionCombobox`'s drawer handling — in
 * drawer presentation the drawer body scrolls, so the popover max-height is
 * dropped.
 */
function RelationRowCombobox({
  entries,
  onToggle,
  selectedIds,
}: RelationRowComboboxProps): ReactNode {
  const [query, setQuery] = useState("");
  const focusOnMount = useFocusOnMount();
  const isDrawer = useResolvedMenuPresentation() === "drawer";
  const trimmed = query.trim();

  const filtered = useMemo(() => {
    if (trimmed === "") {
      return [...entries];
    }
    const lower = trimmed.toLowerCase();
    return entries.filter((entry) => entry.title.toLowerCase().includes(lower));
  }, [entries, trimmed]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <InputGroup className="h-8">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <IconSearch />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search rows"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Enter") {
              return;
            }
            event.preventDefault();
            const first = filtered[0];
            if (first) {
              onToggle(first.id);
            }
          }}
          placeholder="Search rows…"
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
        {filtered.map((entry) => (
          <button
            className={RELATION_ROW_CLASS}
            key={entry.id}
            onClick={() => onToggle(entry.id)}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">{entry.title}</span>
            {selectedIds.includes(entry.id) ? (
              <IconCheck className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
            ) : null}
          </button>
        ))}
        {filtered.length === 0 ? (
          <div className="px-2 py-2 text-muted-foreground text-sm">No rows</div>
        ) : null}
      </div>
    </div>
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
