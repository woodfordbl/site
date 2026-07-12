import { type ReactNode, useMemo } from "react";

import { urlCellHref } from "@/components/database/database-grid-helpers.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { useDatabase, useDatabaseRows } from "@/db/queries/use-database.ts";
import { BLOCK_COLOR_DEFS } from "@/lib/blocks/block-colors.ts";
import {
  cellToPlainText,
  coerceCellValue,
  formatCellValue,
  isCellEmpty,
} from "@/lib/databases/cell-values.ts";
import { formulaCellErrorDisplay } from "@/lib/databases/formula-values.ts";
import { formulaValueToDisplay } from "@/lib/formula/display.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseSelectOption,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Display-mode cell renderers, one per field type. Pure presentation — all
 * editing behavior (input overlays, checkbox toggles) lives in
 * `database-cell-editor.tsx`.
 */

/** Visible option pills before a multi-select cell collapses to "+n". */
const MAX_VISIBLE_OPTION_PILLS = 3;

/**
 * One select/multi-select option pill. Colored options reuse the block color
 * tokens (`BLOCK_COLOR_DEFS`) for both the pill background and the leading
 * dot; colorless options stay muted. Shared with the popover option editors.
 */
export function DatabaseOptionPill({
  option,
}: {
  option: DatabaseSelectOption;
}) {
  const color = option.color ? BLOCK_COLOR_DEFS[option.color] : undefined;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-foreground text-xs",
        color ? color.bgClass : "bg-muted"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full bg-current",
          color ? color.textClass : "text-muted-foreground"
        )}
      />
      <span className="truncate">{option.name}</span>
    </span>
  );
}

function selectedOptions(
  options: readonly DatabaseSelectOption[],
  optionIds: readonly string[]
): DatabaseSelectOption[] {
  const result: DatabaseSelectOption[] = [];
  for (const optionId of optionIds) {
    const option = options.find((entry) => entry.id === optionId);
    // Stale option ids (deleted options) render nothing rather than the id.
    if (option) {
      result.push(option);
    }
  }
  return result;
}

interface RelationCellViewProps {
  field: DatabaseField & { type: "relation" };
  /** Coerced target-row id array; may be empty or hold stale ids. */
  rowIds: readonly string[];
}

/**
 * Relation cell display: one neutral chip per linked target row, titled by
 * the target database's primary field (blank titles read "Untitled"), with
 * the same `MAX_VISIBLE_OPTION_PILLS` + "+n" overflow as multi-select. Ids
 * that resolve to no target row are skipped — stale links render nothing
 * rather than error chips. Fetches the target schema and rows itself, so the
 * grid stays ignorant of cross-database reads.
 */
export function RelationCellView({
  field,
  rowIds,
}: RelationCellViewProps): ReactNode {
  const targetDatabase = useDatabase(field.targetDatabaseId);
  const targetRows = useDatabaseRows(field.targetDatabaseId);

  const titles = useMemo(() => {
    const primaryField = targetDatabase?.fields.find(
      (entry) => entry.id === targetDatabase.primaryFieldId
    );
    if (!primaryField) {
      return [];
    }
    const rowsById = new Map(targetRows.map((row) => [row.id, row]));
    const result: { id: string; title: string }[] = [];
    for (const rowId of rowIds) {
      const row = rowsById.get(rowId);
      if (!row) {
        continue;
      }
      const title = cellToPlainText(
        primaryField,
        row.values[primaryField.id]
      ).trim();
      result.push({ id: rowId, title: title === "" ? "Untitled" : title });
    }
    return result;
  }, [rowIds, targetDatabase, targetRows]);

  if (titles.length === 0) {
    return null;
  }
  const visible = titles.slice(0, MAX_VISIBLE_OPTION_PILLS);
  const overflow = titles.length - visible.length;
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {visible.map((entry) => (
        <span
          className="inline-flex min-w-0 shrink-0 items-center rounded-md bg-muted px-1.5 py-0.5 text-foreground text-xs"
          key={entry.id}
        >
          <span className="truncate">{entry.title}</span>
        </span>
      ))}
      {overflow > 0 ? (
        <span className="shrink-0 text-muted-foreground text-xs">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

interface DatabaseCellValueViewProps {
  field: DatabaseField;
  mode: "view" | "edit";
  /**
   * Display clock instant for `relative`-format date fields — pass the table
   * view's visible clock tick so "3 days ago" re-renders as time passes.
   * Omitted (e.g. row-page properties panel) it falls back to render-time.
   */
  now?: Date;
  value: DatabaseCellValue | undefined;
}

/**
 * Formula cell display over the merged computed value (see
 * `lib/databases/formula-values.ts`): numbers right-aligned tabular-nums,
 * booleans "Yes"/"No" text (not a checkbox — the cell is read-only), strings
 * plain, list results comma-joined. Evaluation errors travel as the
 * overlay's marker and render as muted "⚠ …" text with the message in a
 * title tooltip.
 */
function DatabaseFormulaCellValue({
  value,
}: {
  value: DatabaseCellValue | undefined;
}): ReactNode {
  const errorDisplay = formulaCellErrorDisplay(value);
  if (errorDisplay !== null) {
    return (
      <span className="truncate text-muted-foreground" title={errorDisplay}>
        {errorDisplay}
      </span>
    );
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return (
      <span className="ml-auto truncate text-right tabular-nums">
        {formulaValueToDisplay(value)}
      </span>
    );
  }
  const display = Array.isArray(value)
    ? value.join(", ")
    : formulaValueToDisplay(value);
  return display === "" ? null : <span className="truncate">{display}</span>;
}

/**
 * Multi-select cell display: selected option pills (stale ids skipped) with
 * the shared `MAX_VISIBLE_OPTION_PILLS` + "+n" overflow pattern.
 */
function DatabaseMultiSelectCellValue({
  field,
  optionIds,
}: {
  field: DatabaseField & { type: "multiSelect" };
  optionIds: readonly string[];
}): ReactNode {
  const options = selectedOptions(field.options, optionIds);
  if (options.length === 0) {
    return null;
  }
  const visible = options.slice(0, MAX_VISIBLE_OPTION_PILLS);
  const overflow = options.length - visible.length;
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden">
      {visible.map((option) => (
        <DatabaseOptionPill key={option.id} option={option} />
      ))}
      {overflow > 0 ? (
        <span className="shrink-0 text-muted-foreground text-xs">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Date cell display: the field's date format over the coerced ISO string,
 * with the table view's clock instant injected so `relative` text matches
 * the tick that re-rendered the row (falling back to render-time when the
 * host surface has no ticking clock).
 */
function DatabaseDateCellValue({
  field,
  now,
  value,
}: {
  field: DatabaseField;
  now: Date | undefined;
  value: DatabaseCellValue;
}): ReactNode {
  const opts = now === undefined ? undefined : { now: () => now };
  return (
    <span className="truncate">{formatCellValue(field, value, opts)}</span>
  );
}

/**
 * Render one cell's stored value for display. Empty cells render nothing;
 * wrong-shaped values are coerced defensively and never throw.
 */
export function DatabaseCellValueView({
  field,
  mode,
  now,
  value,
}: DatabaseCellValueViewProps): ReactNode {
  // Formula cells render the merged computed value (or the error marker)
  // before coercion — the marker array would otherwise coerce to empty.
  if (field.type === "formula") {
    return <DatabaseFormulaCellValue value={value} />;
  }
  const coerced = coerceCellValue(field, value);
  // Checkboxes render their box even when unset; every other type stays blank.
  if (field.type !== "checkbox" && isCellEmpty(coerced)) {
    return null;
  }

  switch (field.type) {
    case "text":
      return (
        <span className="truncate">
          {typeof coerced === "string" ? coerced : ""}
        </span>
      );
    case "url": {
      const text = typeof coerced === "string" ? coerced : "";
      if (mode === "view") {
        return (
          <a
            className="truncate text-primary underline-offset-2 hover:underline"
            href={urlCellHref(text)}
            rel="noopener noreferrer"
            target="_blank"
          >
            {text}
          </a>
        );
      }
      // In edit mode the click edits the cell, so render plain link styling.
      return <span className="truncate text-primary">{text}</span>;
    }
    case "number":
      return (
        <span className="truncate tabular-nums">
          {formatCellValue(field, coerced)}
        </span>
      );
    case "checkbox":
      return (
        <Checkbox aria-label={field.name} checked={coerced === true} disabled />
      );
    case "select": {
      const option =
        typeof coerced === "string"
          ? selectedOptions(field.options, [coerced])[0]
          : undefined;
      return option ? <DatabaseOptionPill option={option} /> : null;
    }
    case "multiSelect":
      return (
        <DatabaseMultiSelectCellValue
          field={field}
          optionIds={Array.isArray(coerced) ? coerced : []}
        />
      );
    case "date":
      return <DatabaseDateCellValue field={field} now={now} value={coerced} />;
    case "relation":
      return (
        <RelationCellView
          field={field}
          rowIds={Array.isArray(coerced) ? coerced : []}
        />
      );
    default:
      return null;
  }
}
