import { IconCalendarPlus } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

import { DatabaseCellValueView } from "@/components/database/database-cell.tsx";
import {
  DatabaseCellInlineEditor,
  DatabaseCheckboxCellEditor,
} from "@/components/database/database-cell-editor.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { setDatabaseRowDefault } from "@/db/queries/database-collection-ops.ts";
import {
  isCreatedTodayDefault,
  ROW_DEFAULT_CREATED_TODAY,
} from "@/lib/databases/row-defaults.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  LocalDatabase,
} from "@/lib/schemas/database.ts";

/**
 * Editors for a field's DEFAULT value (`database.rowDefaults`) in the
 * row-template header — what "New row" seeds. Reuses the grid's NATIVE cell
 * editors (select combobox with option creation, calendar, inline text)
 * through their `commitValueOverride`, so defaults edit exactly like cells.
 * Date fields add one extra choice the grid doesn't have: the
 * created-today sentinel ("On row creation").
 */

const valueButtonClassName =
  "flex min-h-7 min-w-0 items-center justify-end rounded-sm px-1 text-right outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50";

function EmptyLabel(): ReactNode {
  return <span className="text-muted-foreground/60">Empty</span>;
}

/** Display state shared by every default editor's closed form. */
function DefaultValueDisplay({
  field,
  value,
}: {
  field: DatabaseField;
  value: DatabaseCellValue | undefined;
}): ReactNode {
  if (value === undefined || value === null || value === "") {
    return <EmptyLabel />;
  }
  if (field.type === "date" && isCreatedTodayDefault(value)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 text-sm">
        <IconCalendarPlus aria-hidden className="size-3.5" />
        On row creation
      </span>
    );
  }
  return <DatabaseCellValueView field={field} mode="edit" value={value} />;
}

/**
 * Date defaults choose between the created-today sentinel and a fixed date:
 * the trigger opens a small menu; "Specific date…" hands off to the grid's
 * native calendar editor.
 */
function DateDefaultEditor({
  database,
  field,
}: {
  database: LocalDatabase;
  field: DatabaseField;
}): ReactNode {
  const value = database.rowDefaults?.[field.id];
  const [pickingDate, setPickingDate] = useState(false);

  return (
    <div className="relative flex min-h-7 min-w-0 items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger className={valueButtonClassName}>
          <DefaultValueDisplay field={field} value={value} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setDatabaseRowDefault(
                database.id,
                field.id,
                ROW_DEFAULT_CREATED_TODAY
              );
            }}
          >
            <IconCalendarPlus />
            On row creation
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setPickingDate(true);
            }}
          >
            Specific date…
          </DropdownMenuItem>
          {value === undefined || value === null ? null : (
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
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {pickingDate ? (
        <DatabaseCellInlineEditor
          commitValueOverride={(next) => {
            setDatabaseRowDefault(database.id, field.id, next);
          }}
          databaseId={database.id}
          field={field}
          onNavigate={() => {
            setPickingDate(false);
          }}
          onStopEdit={() => {
            setPickingDate(false);
          }}
          rowId=""
          value={isCreatedTodayDefault(value) ? undefined : value}
        />
      ) : null}
    </div>
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
  const [editing, setEditing] = useState(false);
  const commit = (next: Parameters<typeof setDatabaseRowDefault>[2]) => {
    setDatabaseRowDefault(database.id, field.id, next);
  };

  if (field.type === "formula") {
    return <span className="text-muted-foreground/60 text-sm">Computed</span>;
  }

  if (field.type === "checkbox") {
    return (
      <div className="relative flex min-h-7 items-center">
        <DatabaseCheckboxCellEditor
          commitValueOverride={commit}
          field={field}
          rowId=""
          value={value}
        />
      </div>
    );
  }

  if (field.type === "date") {
    return <DateDefaultEditor database={database} field={field} />;
  }

  // Text/url/number/select/multiSelect: closed display button; clicking
  // mounts the grid's native inline/popover editor anchored to this slot.
  return (
    <div className="relative flex min-h-7 w-44 min-w-0 items-center justify-end sm:w-56">
      <button
        className={valueButtonClassName}
        onClick={() => {
          setEditing(true);
        }}
        type="button"
      >
        <DefaultValueDisplay field={field} value={value} />
      </button>
      {editing ? (
        <DatabaseCellInlineEditor
          commitValueOverride={commit}
          databaseId={database.id}
          field={field}
          onNavigate={() => {
            setEditing(false);
          }}
          onStopEdit={() => {
            setEditing(false);
          }}
          rowId=""
          value={value}
        />
      ) : null}
    </div>
  );
}
