import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";

import {
  type CellEditMove,
  type CellEditTarget,
  parseNumberCellInput,
} from "@/components/database/database-grid-helpers.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { updateDatabaseCell } from "@/db/queries/database-collection-ops.ts";
import { coerceCellValue } from "@/lib/databases/cell-values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Milestone-1 inline cell editing: a borderless input overlay for
 * text/url/number cells and an in-place checkbox toggle. Select, multi-select,
 * and date stay display-only until Wave 3 adds their popover editors.
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
 * Borderless input overlay filling a text/url/number cell. Commits through
 * `updateDatabaseCell` on blur/Enter/Tab; Escape reverts without writing.
 * EditableSurface philosophy: native input, transparent chrome, only a subtle
 * inset ring marks the editing cell.
 */
export function DatabaseCellInlineEditor({
  field,
  onNavigate,
  onStopEdit,
  rowId,
  value,
}: DatabaseCellInlineEditorProps): ReactNode {
  const initial = initialDraft(field, value);
  const [draft, setDraft] = useState(initial);
  // Set once Enter/Tab/Escape handled the exit so the trailing blur is a no-op.
  const finishedRef = useRef(false);
  const isNumber = field.type === "number";

  const commit = () => {
    if (draft === initial) {
      return;
    }
    const next: DatabaseCellValue = isNumber
      ? parseNumberCellInput(draft)
      : draft === ""
        ? null
        : draft;
    updateDatabaseCell(rowId, field.id, next);
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
      ref={(node) => {
        // Focus + select-all on mount so typing overwrites, matching grid
        // editors; `autoFocus` is avoided per a11y lint rules.
        node?.focus();
        node?.select();
      }}
      type="text"
      value={draft}
    />
  );
}

interface DatabaseCheckboxCellEditorProps {
  field: DatabaseField;
  rowId: string;
  value: DatabaseCellValue | undefined;
}

/** Edit-mode checkbox cell — toggles the stored boolean directly. */
export function DatabaseCheckboxCellEditor({
  field,
  rowId,
  value,
}: DatabaseCheckboxCellEditorProps): ReactNode {
  const checked = coerceCellValue(field, value) === true;
  return (
    <Checkbox
      aria-label={field.name}
      checked={checked}
      onCheckedChange={(next) => {
        updateDatabaseCell(rowId, field.id, next === true);
      }}
    />
  );
}
