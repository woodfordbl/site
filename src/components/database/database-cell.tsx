import type { ReactNode } from "react";

import { urlCellHref } from "@/components/database/database-grid-helpers.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { BLOCK_COLOR_DEFS } from "@/lib/blocks/block-colors.ts";
import {
  coerceCellValue,
  formatCellValue,
  isCellEmpty,
} from "@/lib/databases/cell-values.ts";
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

function OptionPill({ option }: { option: DatabaseSelectOption }) {
  return (
    <span className="inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-foreground text-xs">
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full bg-current",
          option.color
            ? BLOCK_COLOR_DEFS[option.color].textClass
            : "text-muted-foreground"
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

interface DatabaseCellValueViewProps {
  field: DatabaseField;
  mode: "view" | "edit";
  value: DatabaseCellValue | undefined;
}

/**
 * Render one cell's stored value for display. Empty cells render nothing;
 * wrong-shaped values are coerced defensively and never throw.
 */
export function DatabaseCellValueView({
  field,
  mode,
  value,
}: DatabaseCellValueViewProps): ReactNode {
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
      return option ? <OptionPill option={option} /> : null;
    }
    case "multiSelect": {
      const options = Array.isArray(coerced)
        ? selectedOptions(field.options, coerced)
        : [];
      if (options.length === 0) {
        return null;
      }
      const visible = options.slice(0, MAX_VISIBLE_OPTION_PILLS);
      const overflow = options.length - visible.length;
      return (
        <span className="flex min-w-0 items-center gap-1 overflow-hidden">
          {visible.map((option) => (
            <OptionPill key={option.id} option={option} />
          ))}
          {overflow > 0 ? (
            <span className="shrink-0 text-muted-foreground text-xs">
              +{overflow}
            </span>
          ) : null}
        </span>
      );
    }
    case "date":
      return (
        <span className="truncate">{formatCellValue(field, coerced)}</span>
      );
    default:
      return null;
  }
}
