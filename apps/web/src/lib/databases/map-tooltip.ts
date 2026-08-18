import {
  cellToPlainText,
  coerceCellValue,
  formatCellValue,
} from "@/lib/databases/cell-values.ts";
import type {
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";

/**
 * @fileoverview Projection of a row into the property rows a marker tooltip
 * shows — the map's answer to Notion's card properties.
 *
 * Pure and separate from `map-data.ts` so the tooltip can grow (more value
 * kinds, more chrome) without pushing the geometry transform around. The
 * canvas stays dumb: it receives finished text and colors, never a field
 * schema, which keeps the MapLibre bundle free of cell-rendering logic.
 *
 * Values project to display text rather than to cell renderers because a
 * tooltip is a hover readout, not an editing surface. Select and multi-select
 * keep their option colors so they read as the same pills the grid shows.
 */

/**
 * Feature properties a region title prefers, most human-readable first. The
 * bundled world countries carry all three; a caller's own GeoJSON may carry
 * none, in which case the row-side join code names the region.
 */
const REGION_NAME_PROPERTIES = ["NAME", "NAME_LONG", "ADMIN"] as const;

/**
 * What a hovered region is called: the feature's own name when it has one, so
 * the card reads "United States of America" rather than the join code "USA"
 * that happens to be in the rows.
 */
export function regionTooltipTitle(
  properties: Record<string, unknown> | null | undefined,
  fallback: string
): string {
  for (const key of REGION_NAME_PROPERTIES) {
    const value = properties?.[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return fallback;
}

/**
 * The rows under a region's title: the aggregate the view computes, plus how
 * many rows produced it — dropped when the aggregate IS the row count, where
 * it would print the same number twice.
 */
export function buildRegionTooltipDetails(
  region: { rowCount: number; value: number },
  valueLabel: string,
  isCount: boolean
): MapTooltipDetail[] {
  const details: MapTooltipDetail[] = [
    {
      fieldId: "value",
      label: valueLabel,
      values: [{ text: region.value.toLocaleString("en-US") }],
    },
  ];
  if (!isCount) {
    details.push({
      fieldId: "rows",
      label: region.rowCount === 1 ? "Row" : "Rows",
      values: [{ text: region.rowCount.toLocaleString("en-US") }],
    });
  }
  return details;
}

/** One value inside a tooltip row; `color` is set for select options. */
export interface MapTooltipValue {
  color?: BlockColor;
  text: string;
}

/** One property row under a tooltip's title. */
export interface MapTooltipDetail {
  fieldId: string;
  /** Property name, shown as the row's label. */
  label: string;
  /** Empty when the cell is empty — such rows are dropped, never blank. */
  values: MapTooltipValue[];
}

/** Option values with their colors, so multi-select keeps every pill. */
function optionValues(
  field: DatabaseField & { type: "multiSelect" | "select" },
  optionIds: readonly string[]
): MapTooltipValue[] {
  const values: MapTooltipValue[] = [];
  for (const option of field.options) {
    if (optionIds.includes(option.id)) {
      values.push({
        text: option.name,
        ...(option.color && { color: option.color }),
      });
    }
  }
  return values;
}

/** The values one field contributes, or `[]` when the cell reads as empty. */
function detailValues(
  field: DatabaseField,
  row: LocalDatabaseRow
): MapTooltipValue[] {
  const raw = row.values[field.id];
  const coerced = coerceCellValue(field, raw);
  if (field.type === "select") {
    return typeof coerced === "string" ? optionValues(field, [coerced]) : [];
  }
  if (field.type === "multiSelect") {
    return Array.isArray(coerced) ? optionValues(field, coerced) : [];
  }
  // Everything else reads as the text the grid would print — numbers with
  // their format, dates with theirs, locations as their label.
  const text = (
    field.type === "number" || field.type === "date"
      ? formatCellValue(field, raw)
      : cellToPlainText(field, raw)
  ).trim();
  return text === "" ? [] : [{ text }];
}

/**
 * The tooltip rows for one row, in the order the view lists them. Fields that
 * are stale (deleted since being added to the view) or empty for this row are
 * skipped: a tooltip with "Operator —" in it is noise on a hover readout.
 */
export function buildMapTooltipDetails(
  fields: readonly DatabaseField[],
  row: LocalDatabaseRow,
  tooltipFieldIds: readonly string[] | undefined
): MapTooltipDetail[] {
  if (!tooltipFieldIds || tooltipFieldIds.length === 0) {
    return [];
  }
  const details: MapTooltipDetail[] = [];
  for (const fieldId of tooltipFieldIds) {
    const field = fields.find((entry) => entry.id === fieldId);
    if (!field) {
      continue;
    }
    const values = detailValues(field, row);
    if (values.length > 0) {
      details.push({ fieldId, label: field.name, values });
    }
  }
  return details;
}
