/**
 * @fileoverview Coordinates and `location` cell values — the layer both the
 * grid and the map read them through.
 *
 * Lives below `map-data.ts` (which imports it) so a location cell can be
 * parsed and rendered by surfaces that never load a map, and so the map view
 * and the location cell editor share one definition of what counts as a
 * coordinate.
 *
 * A location value is `{ label, lat?, lng? }` — see
 * `lib/schemas/database-location.ts` for why the coordinates are optional.
 * Two inputs normalize into that shape: the object itself, and a bare string
 * (a pasted address, or a CSV column, or the leftovers of a text field whose
 * type was changed to `location`). A string that parses as two in-range
 * numbers keeps them, so pasting "37.77, -122.41" lands a plottable point
 * with no geocoder involved.
 */

import type { DatabaseCellValue } from "@/lib/schemas/database.ts";
import type { DatabaseLocationValue } from "@/lib/schemas/database-location.ts";

/** A resolved point. Latitude first, matching how people write coordinates. */
export interface MapCoordinate {
  lat: number;
  lng: number;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

const COORDINATE_SEPARATOR = /[,;\s]+/;

/**
 * Parse a "lat, lng" string. Accepts comma, semicolon or whitespace separators
 * and tolerates wrapping parens/brackets. Returns `null` for anything that
 * isn't exactly two in-range numbers — a half-typed value is not a location.
 */
export function parseCoordinateText(text: string): MapCoordinate | null {
  const cleaned = text.trim().replace(/^[([]|[)\]]$/g, "");
  if (cleaned === "") {
    return null;
  }
  const parts = cleaned.split(COORDINATE_SEPARATOR).filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!(isValidLatitude(lat) && isValidLongitude(lng))) {
    return null;
  }
  return { lat, lng };
}

/** Coordinates as the pasteable "lat, lng" text the editors round-trip. */
export function formatCoordinateText(coordinate: MapCoordinate): string {
  return `${coordinate.lat}, ${coordinate.lng}`;
}

/** Whether a raw cell value is already in the stored location shape. */
export function isLocationValue(
  value: DatabaseCellValue | undefined
): value is DatabaseLocationValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { label?: unknown }).label === "string"
  );
}

/**
 * Normalize any stored value into a location, or `null` when it holds nothing
 * usable. A bare string becomes an unresolved label, upgraded to a resolved
 * point when it parses as a coordinate pair. Out-of-range or half-present
 * coordinates are dropped rather than kept as a broken pin — the label
 * survives, so the row still says where it means.
 */
export function normalizeLocationValue(
  value: DatabaseCellValue | undefined
): DatabaseLocationValue | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }
    const parsed = parseCoordinateText(trimmed);
    return parsed ? { ...parsed, label: trimmed } : { label: trimmed };
  }
  if (!isLocationValue(value)) {
    return null;
  }
  const label = value.label.trim();
  const coordinate =
    typeof value.lat === "number" &&
    typeof value.lng === "number" &&
    isValidLatitude(value.lat) &&
    isValidLongitude(value.lng)
      ? { lat: value.lat, lng: value.lng }
      : null;
  if (label === "" && coordinate === null) {
    return null;
  }
  // A coordinate-only value (dropped pin, no address yet) labels itself.
  const resolvedLabel =
    label === "" && coordinate ? formatCoordinateText(coordinate) : label;
  return coordinate
    ? { ...coordinate, label: resolvedLabel }
    : { label: resolvedLabel };
}

/**
 * The plottable point of a location value, or `null` when the label has not
 * been resolved. The only sanctioned way to read coordinates off a cell: it
 * enforces the both-or-neither invariant the flat stored shape cannot.
 */
export function locationCoordinate(
  value: DatabaseCellValue | undefined
): MapCoordinate | null {
  const location = normalizeLocationValue(value);
  if (!location) {
    return null;
  }
  return typeof location.lat === "number" && typeof location.lng === "number"
    ? { lat: location.lat, lng: location.lng }
    : null;
}
