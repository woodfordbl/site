import { IconPlus } from "@tabler/icons-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { DatabaseCellValueView } from "@/components/database/database-cell.tsx";
import {
  DatabaseCellInlineEditor,
  DatabaseCheckboxCellEditor,
} from "@/components/database/database-cell-editor.tsx";
import { DatabaseColumnMenu } from "@/components/database/database-column-menu.tsx";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import {
  type CellEditMove,
  type CellEditTarget,
  isInlineEditableField,
  isSyncedField,
} from "@/components/database/database-grid-helpers.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  addDatabaseField,
  setDatabaseRowPropertiesVisibleFieldIds,
} from "@/db/queries/database-collection-ops.ts";
import { createDatabaseField } from "@/lib/databases/field-defs.ts";
import { resolveColumnOrder } from "@/lib/databases/view-config.ts";
import { evaluateExpression, exprError } from "@/lib/expr/evaluate.ts";
import { exprValueToDisplay } from "@/lib/expr/format-result.ts";
import { parseExpression } from "@/lib/expr/parse.ts";
import { createRowScope } from "@/lib/expr/row-scope.ts";
import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The row page's properties panel: one row per visible non-primary field
 * (icon + name + value), in schema order. The primary field is excluded — it
 * IS the page title rendered above the panel. Local fields edit inline by
 * reusing the grid's cell editors; synced fields (`sourceKey`) are always
 * read-only, and formula fields render their computed value. Property names
 * open the same column menu as table headers. Visibility is filtered by
 * `database.rowPropertiesVisibleFieldIds` (DB-wide, independent of views).
 */

/** Evaluate a formula field's expression against the row for display. */
function formulaDisplay(
  field: Extract<DatabaseField, { type: "formula" }>,
  fields: DatabaseField[],
  values: LocalDatabaseRow["values"]
): string {
  if (field.expression.trim() === "") {
    return "";
  }
  const parsed = parseExpression(field.expression);
  if (!parsed.ok) {
    return exprValueToDisplay(exprError(parsed.error.message));
  }
  const scope = createRowScope(fields, values, { now: () => new Date() });
  return exprValueToDisplay(evaluateExpression(parsed.ast, scope));
}

interface RowPropertyValueProps {
  editing: boolean;
  field: DatabaseField;
  fields: DatabaseField[];
  onNavigate: (move: CellEditMove, from: CellEditTarget) => void;
  onStartEdit: (fieldId: string) => void;
  onStopEdit: () => void;
  row: LocalDatabaseRow;
}

function RowPropertyValue({
  editing,
  field,
  fields,
  onNavigate,
  onStartEdit,
  onStopEdit,
  row,
}: RowPropertyValueProps): ReactNode {
  const value = row.values[field.id];

  if (field.type === "formula") {
    const display = formulaDisplay(field, fields, row.values);
    return (
      <div className="flex min-h-8 w-full min-w-0 items-center overflow-hidden px-2">
        {display === "" ? (
          <RowPropertyEmptyLabel />
        ) : (
          <span className="truncate">{display}</span>
        )}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <DatabaseCheckboxCellEditor
        disabled={isSyncedField(field)}
        field={field}
        rowId={row.id}
        value={value}
      />
    );
  }

  if (!isInlineEditableField(field)) {
    // Synced field: display-only, view-mode rendering (url cells link out).
    return (
      <div className="flex min-h-8 w-full min-w-0 items-center overflow-hidden px-2">
        <DatabaseCellValueView field={field} mode="view" value={value} />
      </div>
    );
  }

  return (
    <>
      {editing ? null : (
        <button
          className="flex h-8 w-full min-w-0 cursor-default items-center overflow-hidden rounded-sm px-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
          onClick={() => {
            onStartEdit(field.id);
          }}
          type="button"
        >
          {value === null || value === undefined || value === "" ? (
            <RowPropertyEmptyLabel />
          ) : (
            <DatabaseCellValueView field={field} mode="edit" value={value} />
          )}
        </button>
      )}
      {editing ? (
        <DatabaseCellInlineEditor
          field={field}
          onNavigate={onNavigate}
          onStopEdit={onStopEdit}
          rowId={row.id}
          value={value}
        />
      ) : null}
    </>
  );
}

function RowPropertyEmptyLabel() {
  return <span className="text-muted-foreground">Empty</span>;
}

interface RowPropertyLabelProps {
  database: LocalDatabase;
  displayFieldIds: readonly string[];
  field: DatabaseField;
}

/** Icon + name trigger for the field's column menu (table-header parity). */
function RowPropertyLabel({
  database,
  displayFieldIds,
  field,
}: RowPropertyLabelProps): ReactNode {
  const FieldIcon = resolveFieldIcon(field);
  const view = database.views[0];
  const label = (
    <>
      <FieldIcon className="size-4 shrink-0 stroke-[1.5px]" />
      <span className="truncate">{field.name}</span>
    </>
  );

  if (!view) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {label}
      </div>
    );
  }

  return (
    <DatabaseColumnMenu
      actions="schema"
      databaseId={database.id}
      displayFieldIds={displayFieldIds}
      field={field}
      isPrimary={false}
      triggerClassName="flex min-w-0 max-w-full items-center gap-1.5 rounded-sm px-0.5 py-0.5 text-left text-muted-foreground outline-hidden transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:bg-muted/50 focus-visible:text-foreground"
      view={view}
    >
      {label}
    </DatabaseColumnMenu>
  );
}

export interface RowPropertiesPanelProps {
  database: LocalDatabase;
  row: LocalDatabaseRow;
}

/** Properties list for one database row (see module doc). */
export function RowPropertiesPanel({
  database,
  row,
}: RowPropertiesPanelProps): ReactNode {
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  const view = database.views[0];
  const displayFieldIds = useMemo(
    () =>
      view
        ? resolveColumnOrder(database.fields, view).map((field) => field.id)
        : database.fields.map((field) => field.id),
    [database.fields, view]
  );

  const panelFields = useMemo(() => {
    const nonPrimary = database.fields.filter(
      (field) => field.id !== database.primaryFieldId
    );
    const visibleIds = database.rowPropertiesVisibleFieldIds;
    if (!visibleIds) {
      return nonPrimary;
    }
    const visible = new Set(visibleIds);
    return nonPrimary.filter((field) => visible.has(field.id));
  }, [
    database.fields,
    database.primaryFieldId,
    database.rowPropertiesVisibleFieldIds,
  ]);

  const editableFieldIds = useMemo(
    () =>
      panelFields
        .filter((field) => isInlineEditableField(field))
        .map((field) => field.id),
    [panelFields]
  );

  const handleStopEdit = useCallback(() => {
    setEditingFieldId(null);
  }, []);

  // Tab/Shift+Tab/Enter step through the panel's editable fields top-to-
  // bottom (one row per field, so every move is vertical); running off
  // either end stops editing.
  const handleNavigate = useCallback(
    (move: CellEditMove, from: CellEditTarget) => {
      const index = editableFieldIds.indexOf(from.fieldId);
      if (index === -1) {
        setEditingFieldId(null);
        return;
      }
      const nextIndex = move === "previous" ? index - 1 : index + 1;
      setEditingFieldId(editableFieldIds[nextIndex] ?? null);
    },
    [editableFieldIds]
  );

  const handleStartEdit = useCallback((fieldId: string) => {
    setEditingFieldId(fieldId);
  }, []);

  const handleAddProperty = useCallback(() => {
    const field = createDatabaseField("text", "Text");
    addDatabaseField(database.id, field);
    // A materialized visible list must adopt the new field explicitly.
    if (database.rowPropertiesVisibleFieldIds) {
      setDatabaseRowPropertiesVisibleFieldIds(database.id, [
        ...database.rowPropertiesVisibleFieldIds,
        field.id,
      ]);
    }
  }, [database.id, database.rowPropertiesVisibleFieldIds]);

  return (
    <div className="flex flex-col gap-0.5">
      {panelFields.map((field) => {
        const isCheckbox = field.type === "checkbox";
        return (
          <div
            className="grid min-h-8 w-full grid-cols-[1fr_2fr] items-center gap-2 text-sm"
            key={field.id}
          >
            <RowPropertyLabel
              database={database}
              displayFieldIds={displayFieldIds}
              field={field}
            />
            <div
              className={cn(
                "relative min-h-8 w-full min-w-0 overflow-hidden",
                isCheckbox && "flex items-center justify-start"
              )}
            >
              <RowPropertyValue
                editing={editingFieldId === field.id}
                field={field}
                fields={database.fields}
                onNavigate={handleNavigate}
                onStartEdit={handleStartEdit}
                onStopEdit={handleStopEdit}
                row={row}
              />
            </div>
          </div>
        );
      })}
      <Button
        className="mt-0.5 h-8 w-full justify-start gap-1.5 px-1 font-normal text-muted-foreground hover:text-foreground"
        onClick={handleAddProperty}
        size="sm"
        type="button"
        variant="ghost"
      >
        <IconPlus aria-hidden className="size-4 stroke-[1.5px]" />
        Add Property
      </Button>
    </div>
  );
}
