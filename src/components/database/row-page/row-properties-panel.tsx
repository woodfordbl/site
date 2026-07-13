import { type ReactNode, useCallback, useMemo, useState } from "react";

import { DatabaseCellValueView } from "@/components/database/database-cell.tsx";
import {
  DatabaseCellInlineEditor,
  DatabaseCheckboxCellEditor,
} from "@/components/database/database-cell-editor.tsx";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import {
  type CellEditMove,
  type CellEditTarget,
  isInlineEditableField,
  isSyncedField,
} from "@/components/database/database-grid-helpers.ts";
import { useFormulaOverlay } from "@/db/formula-engine.ts";
import type { FormulaCellResult } from "@/lib/databases/formula-values.ts";
import { formulaValueToDisplay } from "@/lib/formula/display.ts";
import { parseFormula } from "@/lib/formula/parse.ts";
import { formulaError } from "@/lib/formula/values.ts";
import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The row page's properties panel: one row per non-primary field (icon +
 * name + value), in schema order. The primary field is excluded — it IS the
 * page title rendered above the panel. Local fields edit inline by reusing
 * the grid's cell editors (`DatabaseCellInlineEditor` overlays the value
 * area, popover editors anchor to it — the ops they write through are
 * position-independent, so no grid coupling); synced fields (`sourceKey`)
 * are always read-only, and formula fields render their computed value.
 */

/**
 * Display string for a formula field: the ENGINE overlay's cell result for
 * this row (same values the table grid shows, reactive to cross-database
 * edits), except parse errors — the engine leaves unparseable expressions
 * blank (the grid surfaces them as a header badge), while this panel keeps
 * rendering the "⚠ …" parse message inline like it always has.
 */
function formulaDisplay(
  field: Extract<DatabaseField, { type: "formula" }>,
  results: Record<string, FormulaCellResult> | undefined
): string {
  if (field.expression.trim() === "") {
    return "";
  }
  const parsed = parseFormula(field.expression);
  if (!parsed.ok) {
    return formulaValueToDisplay(formulaError(parsed.error.message));
  }
  return results?.[field.id]?.display ?? "";
}

interface RowPropertyValueProps {
  editing: boolean;
  field: DatabaseField;
  /** Engine-computed formula results for THIS row (rowId picked by the panel). */
  formulaResults: Record<string, FormulaCellResult> | undefined;
  onNavigate: (move: CellEditMove, from: CellEditTarget) => void;
  onStartEdit: (fieldId: string) => void;
  onStopEdit: () => void;
  row: LocalDatabaseRow;
}

function RowPropertyValue({
  editing,
  field,
  formulaResults,
  onNavigate,
  onStartEdit,
  onStopEdit,
  row,
}: RowPropertyValueProps): ReactNode {
  const value = row.values[field.id];

  if (field.type === "formula") {
    const display = formulaDisplay(field, formulaResults);
    return display === "" ? (
      <RowPropertyEmptyLabel />
    ) : (
      <span className="truncate">{display}</span>
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
    return <DatabaseCellValueView field={field} mode="view" value={value} />;
  }

  return (
    <>
      <button
        className="flex size-full min-w-0 cursor-default items-center overflow-hidden rounded-sm text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
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

  // Engine overlay for the whole database; this row's results picked below.
  // Reactive to cross-database edits (rollups update live) unlike the old
  // per-row compute, which only re-ran when this component re-rendered.
  const formulaOverlay = useFormulaOverlay(database.id);
  const formulaResults = formulaOverlay.get(row.id);

  const panelFields = useMemo(
    () =>
      database.fields.filter((field) => field.id !== database.primaryFieldId),
    [database.fields, database.primaryFieldId]
  );

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

  if (panelFields.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {panelFields.map((field) => {
        const FieldIcon = resolveFieldIcon(field);
        const isCheckbox = field.type === "checkbox";
        return (
          <div
            className="flex min-h-8 items-center gap-2 text-sm"
            key={field.id}
          >
            <div className="flex w-36 shrink-0 items-center gap-1.5 text-muted-foreground sm:w-44">
              <FieldIcon className="size-4 shrink-0 stroke-[1.5px]" />
              <span className="truncate">{field.name}</span>
            </div>
            <div
              className={cn(
                "relative flex min-h-8 min-w-0 flex-1 items-center overflow-hidden",
                isCheckbox && "justify-start"
              )}
            >
              <RowPropertyValue
                editing={editingFieldId === field.id}
                field={field}
                formulaResults={formulaResults}
                onNavigate={handleNavigate}
                onStartEdit={handleStartEdit}
                onStopEdit={handleStopEdit}
                row={row}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
