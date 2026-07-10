import { type ReactNode, useEffect, useRef, useState } from "react";

import { DatabaseCellValueView } from "@/components/database/database-cell.tsx";
import { parseNumberCellInput } from "@/components/database/database-grid-helpers.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { setDatabaseRowDefault } from "@/db/queries/database-collection-ops.ts";
import { toIsoDatePart } from "@/lib/databases/cell-values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  LocalDatabase,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Editors for a field's DEFAULT value (`database.rowDefaults`) in the
 * row-template header — what "New row" seeds. Small, self-contained
 * equivalents of the grid's cell editors: the grid ones write through
 * `updateDatabaseCell(rowId, …)` and can't target a defaults map, and
 * defaults don't need Tab-navigation or option creation. Display states
 * reuse `DatabaseCellValueView`, so chips/formatting match real rows.
 */

const valueButtonClassName =
  "flex min-h-7 min-w-0 max-w-56 items-center justify-end rounded-sm px-1 text-right outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50";

function EmptyLabel(): ReactNode {
  return <span className="text-muted-foreground/60">Empty</span>;
}

/** Click-to-edit text input for text/url/number/date defaults. */
function TextishDefaultEditor({
  database,
  field,
  value,
}: {
  database: LocalDatabase;
  field: DatabaseField;
  value: DatabaseCellValue | undefined;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const isDate = field.type === "date";
  const isNumber = field.type === "number";
  const initial =
    typeof value === "string" || typeof value === "number"
      ? String(
          isDate && typeof value === "string" ? toIsoDatePart(value) : value
        )
      : "";

  const commit = (raw: string) => {
    setEditing(false);
    const trimmed = raw.trim();
    if (isNumber) {
      setDatabaseRowDefault(database.id, field.id, parseNumberCellInput(raw));
      return;
    }
    setDatabaseRowDefault(
      database.id,
      field.id,
      trimmed === "" ? null : trimmed
    );
  };

  if (editing) {
    return (
      <input
        className="h-7 w-44 rounded-sm border border-border bg-background px-1.5 text-right text-sm outline-none focus:border-ring"
        defaultValue={initial}
        onBlur={(event) => {
          commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(event.currentTarget.value);
          }
          if (event.key === "Escape") {
            setEditing(false);
          }
        }}
        ref={inputRef}
        type={isDate ? "date" : "text"}
      />
    );
  }

  return (
    <button
      className={valueButtonClassName}
      onClick={() => {
        setEditing(true);
      }}
      type="button"
    >
      {value === undefined || value === null || value === "" ? (
        <EmptyLabel />
      ) : (
        <DatabaseCellValueView field={field} mode="edit" value={value} />
      )}
    </button>
  );
}

/** Option menu for select/multiSelect defaults. */
function SelectDefaultEditor({
  database,
  field,
  value,
}: {
  database: LocalDatabase;
  field: Extract<DatabaseField, { type: "select" | "multiSelect" }>;
  value: DatabaseCellValue | undefined;
}): ReactNode {
  const isMulti = field.type === "multiSelect";
  const selectedIds = isMulti
    ? new Set(Array.isArray(value) ? value : [])
    : new Set(typeof value === "string" ? [value] : []);
  const hasValue = selectedIds.size > 0;

  const toggle = (optionId: string) => {
    if (!isMulti) {
      setDatabaseRowDefault(
        database.id,
        field.id,
        selectedIds.has(optionId) ? null : optionId
      );
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(optionId)) {
      next.delete(optionId);
    } else {
      next.add(optionId);
    }
    setDatabaseRowDefault(
      database.id,
      field.id,
      next.size > 0 ? [...next] : null
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={valueButtonClassName}>
        {hasValue ? (
          <DatabaseCellValueView field={field} mode="edit" value={value} />
        ) : (
          <EmptyLabel />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {field.options.map((option) =>
          isMulti ? (
            <DropdownMenuCheckboxItem
              checked={selectedIds.has(option.id)}
              closeOnClick={false}
              key={option.id}
              onCheckedChange={() => {
                toggle(option.id);
              }}
            >
              {option.name}
            </DropdownMenuCheckboxItem>
          ) : (
            <DropdownMenuItem
              key={option.id}
              onClick={() => {
                toggle(option.id);
              }}
            >
              <span
                className={cn(
                  "min-w-0 truncate",
                  selectedIds.has(option.id) && "font-medium"
                )}
              >
                {option.name}
              </span>
            </DropdownMenuItem>
          )
        )}
        {hasValue ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setDatabaseRowDefault(database.id, field.id, null);
              }}
            >
              Clear default
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RowDefaultValueEditor({
  database,
  field,
}: {
  database: LocalDatabase;
  field: DatabaseField;
}): ReactNode {
  const value = database.rowDefaults?.[field.id];

  if (field.type === "formula") {
    return <span className="text-muted-foreground/60 text-sm">Computed</span>;
  }

  if (field.type === "checkbox") {
    return (
      <Checkbox
        aria-label={`Default ${field.name}`}
        checked={value === true}
        onCheckedChange={(checked) => {
          setDatabaseRowDefault(
            database.id,
            field.id,
            checked === true ? true : null
          );
        }}
      />
    );
  }

  if (field.type === "select" || field.type === "multiSelect") {
    return (
      <SelectDefaultEditor database={database} field={field} value={value} />
    );
  }

  return (
    <TextishDefaultEditor database={database} field={field} value={value} />
  );
}
