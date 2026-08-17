import { useMemo } from "react";

import { useInlineFormulaPage } from "@/components/editor/inline-formula-page.tsx";
import {
  locationCoordinate,
  normalizeLocationValue,
} from "@/lib/databases/location-values.ts";
import type { MapProps } from "@/lib/schemas/block-props.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

/**
 * @fileoverview Resolves what a `map` block should draw: the pin stored in the
 * block, or the host row's location property when the block is bound to one.
 *
 * Binding reads the same `thisPage` scope inline formula tokens use
 * (`useInlineFormulaPage`), which already resolves a database row page, a row
 * template page (against the template's default values) and the template
 * editor's Live Preview row. So a map dropped on a row template renders each
 * row's own place, exactly as a `thisPage.Place` token would print it — one
 * block, every row page.
 *
 * Every way this can come up short is its own state rather than a blank map: a
 * label with no coordinates still names somewhere, an empty cell is the normal
 * state of a fresh row, and a binding whose property is gone needs saying so.
 */

/** Location properties on the host row's database, for the binding picker. */
export function useMapBlockLocationFields(): DatabaseField[] {
  const model = useInlineFormulaPage();
  const fields = model?.databaseFields;

  return useMemo(
    () => (fields ?? []).filter((field) => field.type === "location"),
    [fields]
  );
}

export type MapBlockPlace =
  /** Draw this: the block's own pin, or the row's resolved point. */
  | { kind: "map"; props: MapProps }
  /** Bound, and the row names a place nothing has geocoded yet. */
  | { kind: "unresolved"; label: string }
  /** Bound, and the row's cell is empty. */
  | { kind: "no-value" }
  /** Bound to a property this page has no access to. */
  | { kind: "unavailable"; reason: "missing-property" | "not-a-row" }
  /** Nothing pinned and nothing bound — the block is still a placeholder. */
  | { kind: "empty" };

/**
 * What to render for `props`. Unbound blocks pass through unchanged, so the
 * binding is purely additive: nothing about a hand-pinned map changes.
 */
export function useMapBlockPlace(props: MapProps): MapBlockPlace {
  const model = useInlineFormulaPage();
  const fieldId = props.locationFieldId;
  const hasRowFields = (model?.databaseFields.length ?? 0) > 0;
  const field = model?.databaseFields.find((entry) => entry.id === fieldId);
  const cell = fieldId === undefined ? undefined : model?.cellValues[fieldId];

  return useMemo(() => {
    if (fieldId === undefined) {
      return (props.markers?.length ?? 0) > 0
        ? { kind: "map", props }
        : { kind: "empty" };
    }
    if (field?.type !== "location") {
      return {
        kind: "unavailable",
        reason: hasRowFields ? "missing-property" : "not-a-row",
      };
    }
    const location = normalizeLocationValue(cell);
    if (!location) {
      return { kind: "no-value" };
    }
    const coordinate = locationCoordinate(cell);
    if (!coordinate) {
      return { kind: "unresolved", label: location.label };
    }
    return {
      kind: "map",
      props: {
        ...props,
        // The point is the row's; the framing stays the block's.
        center: [coordinate.lng, coordinate.lat],
        markers: [{ ...coordinate, label: location.label }],
      },
    };
  }, [cell, field, fieldId, hasRowFields, props]);
}
