import {
  cellToPlainText,
  coerceCellValue,
} from "@/lib/databases/cell-values.ts";
import {
  CHART_Y_AGGREGATE_LABELS,
  chartYFieldCandidates,
} from "@/lib/databases/chart-data.ts";
import { computeAggregate } from "@/lib/databases/row-aggregate.ts";
import type {
  DatabaseAggregateFn,
  DatabaseField,
  DatabaseTableViewConfig,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * @fileoverview Pure map-view data transform: project already-filtered/sorted/formula-merged
 * rows onto geometry. Two shapes, one per mark family — points for
 * `pins`/`cluster`, joined+aggregated regions for `region`.
 *
 * Coordinates come from ordinary fields rather than a location field type (see
 * docs/proposals/maps.md): two number columns, or one text column holding
 * "lat, lng". Rows that yield no usable coordinate are counted, never dropped
 * silently — the view reports them.
 */

export type DatabaseMapConfig = NonNullable<DatabaseTableViewConfig["map"]>;

export type DatabaseMapMark = NonNullable<DatabaseMapConfig["mark"]>;

export type DatabaseMapPointMode = NonNullable<DatabaseMapConfig["pointMode"]>;

export type DatabaseMapValueAggregate = NonNullable<
  DatabaseMapConfig["valueAggregate"]
>;

export type DatabaseMapScale = NonNullable<DatabaseMapConfig["scale"]>;

export const DEFAULT_MAP_MARK: DatabaseMapMark = "pins";

export const DEFAULT_MAP_POINT_MODE: DatabaseMapPointMode = "pair";

export const DEFAULT_MAP_VALUE_AGGREGATE: DatabaseMapValueAggregate = "count";

export const DEFAULT_MAP_SCALE: DatabaseMapScale = "linear";

/**
 * Feature property the row-side region code joins against. `ADM0_A3`, not
 * `ISO_A3`: Natural Earth stores `-99` in `ISO_A3` for France, Norway, Kosovo,
 * N. Cyprus and Somaliland, while `ADM0_A3` is unique across all 177 features.
 */
export const DEFAULT_MAP_JOIN_PROPERTY = "ADM0_A3";

/** Choropleth ramp steps — one per `--chart-N` token. */
export const MAP_REGION_BUCKET_COUNT = 5;

/** Marks that plot one point per row (as opposed to shading regions). */
const POINT_MARKS: readonly DatabaseMapMark[] = ["pins", "cluster"];

export interface MapCoordinate {
  lat: number;
  lng: number;
}

export interface MapPoint extends MapCoordinate {
  /** Select option id from the color field, when one is configured. */
  colorOptionId?: string;
  label: string;
  rowId: string;
}

export interface MapPointsResult {
  points: MapPoint[];
  /** Rows that passed the filters but carry no usable coordinate. */
  skippedRowCount: number;
}

export interface MapRegion {
  /** Normalized join code — compare against normalized feature properties. */
  key: string;
  /** Raw first-seen value, for tooltips and legends. */
  label: string;
  rowCount: number;
  value: number;
}

export interface MapRegionsResult {
  max: number;
  min: number;
  regions: MapRegion[];
  /** Rows whose join field is empty, so they land on no region. */
  skippedRowCount: number;
}

/** Longitude/latitude bounding box as `[[west, south], [east, north]]`. */
export type MapBounds = [[number, number], [number, number]];

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

/** Whether this mark plots points (vs. shading joined regions). */
export function isPointMark(mark: DatabaseMapMark): boolean {
  return POINT_MARKS.includes(mark);
}

export function resolveMapMark(map: DatabaseMapConfig): DatabaseMapMark {
  return map.mark ?? DEFAULT_MAP_MARK;
}

export function resolveMapPointMode(
  map: DatabaseMapConfig
): DatabaseMapPointMode {
  return map.pointMode ?? DEFAULT_MAP_POINT_MODE;
}

export function resolveMapJoinProperty(map: DatabaseMapConfig): string {
  const trimmed = map.joinProperty?.trim();
  return trimmed ? trimmed : DEFAULT_MAP_JOIN_PROPERTY;
}

/**
 * Region join key for a raw code: upper-cased, trimmed, internal whitespace
 * collapsed. Applied to BOTH sides of the join so "united states" matches
 * "United States" and "  USA " matches "USA".
 */
export function normalizeRegionKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

const COORDINATE_SEPARATOR = /[,;\s]+/;

/**
 * Parse a "lat, lng" cell. Accepts comma, semicolon or whitespace separators
 * and tolerates wrapping parens/brackets. Returns `null` for anything that
 * isn't exactly two in-range numbers — a half-typed cell is not a location.
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

function fieldById(
  fields: readonly DatabaseField[],
  fieldId: string | undefined
): DatabaseField | null {
  if (fieldId === undefined) {
    return null;
  }
  return fields.find((field) => field.id === fieldId) ?? null;
}

function fieldOfType(
  fields: readonly DatabaseField[],
  fieldId: string | undefined,
  types: readonly DatabaseField["type"][]
): DatabaseField | null {
  const field = fieldById(fields, fieldId);
  return field && types.includes(field.type) ? field : null;
}

/** Number fields, the only ones that can back a lat or lng axis. */
export function mapLatLngFieldCandidates(
  fields: readonly DatabaseField[]
): DatabaseField[] {
  return fields.filter((field) => field.type === "number");
}

/** Fields that can hold a "lat, lng" string. */
export function mapCoordinateFieldCandidates(
  fields: readonly DatabaseField[]
): DatabaseField[] {
  return fields.filter(
    (field) => field.type === "text" || field.type === "formula"
  );
}

/** Fields that can carry a region code. */
export function mapJoinFieldCandidates(
  fields: readonly DatabaseField[]
): DatabaseField[] {
  return fields.filter(
    (field) =>
      field.type === "select" ||
      field.type === "text" ||
      field.type === "formula"
  );
}

/** Fields a region aggregate can reduce — the chart Y taxonomy exactly. */
export function mapValueFieldCandidates(
  fields: readonly DatabaseField[]
): DatabaseField[] {
  return chartYFieldCandidates(fields);
}

/** Select fields, whose option colors can tint markers. */
export function mapColorFieldCandidates(
  fields: readonly DatabaseField[]
): DatabaseField[] {
  return fields.filter((field) => field.type === "select");
}

export function resolveMapLatField(
  fields: readonly DatabaseField[],
  map: DatabaseMapConfig
): DatabaseField | null {
  return fieldOfType(fields, map.latFieldId, ["number"]);
}

export function resolveMapLngField(
  fields: readonly DatabaseField[],
  map: DatabaseMapConfig
): DatabaseField | null {
  return fieldOfType(fields, map.lngFieldId, ["number"]);
}

export function resolveMapCoordField(
  fields: readonly DatabaseField[],
  map: DatabaseMapConfig
): DatabaseField | null {
  return fieldOfType(fields, map.coordFieldId, ["text", "formula"]);
}

export function resolveMapJoinField(
  fields: readonly DatabaseField[],
  map: DatabaseMapConfig
): DatabaseField | null {
  return fieldOfType(fields, map.joinFieldId, ["select", "text", "formula"]);
}

export function resolveMapValueField(
  fields: readonly DatabaseField[],
  map: DatabaseMapConfig
): DatabaseField | null {
  const aggregate = map.valueAggregate ?? DEFAULT_MAP_VALUE_AGGREGATE;
  if (aggregate === "count") {
    return null;
  }
  return fieldOfType(fields, map.valueFieldId, ["number", "formula"]);
}

export function resolveMapColorField(
  fields: readonly DatabaseField[],
  map: DatabaseMapConfig
): DatabaseField | null {
  return fieldOfType(fields, map.colorFieldId, ["select"]);
}

/**
 * Whether the config names enough fields to draw anything. Drives the view's
 * empty state ("Pick a latitude and longitude field").
 */
export function isMapConfigured(
  fields: readonly DatabaseField[],
  map: DatabaseMapConfig
): boolean {
  if (!isPointMark(resolveMapMark(map))) {
    return resolveMapJoinField(fields, map) !== null;
  }
  if (resolveMapPointMode(map) === "coordinate") {
    return resolveMapCoordField(fields, map) !== null;
  }
  return (
    resolveMapLatField(fields, map) !== null &&
    resolveMapLngField(fields, map) !== null
  );
}

function coordinateForRow(
  fields: readonly DatabaseField[],
  map: DatabaseMapConfig,
  row: LocalDatabaseRow
): MapCoordinate | null {
  if (resolveMapPointMode(map) === "coordinate") {
    const coordField = resolveMapCoordField(fields, map);
    if (!coordField) {
      return null;
    }
    return parseCoordinateText(
      cellToPlainText(coordField, row.values[coordField.id])
    );
  }
  const latField = resolveMapLatField(fields, map);
  const lngField = resolveMapLngField(fields, map);
  if (!(latField && lngField)) {
    return null;
  }
  const lat = coerceCellValue(latField, row.values[latField.id]);
  const lng = coerceCellValue(lngField, row.values[lngField.id]);
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }
  if (!(isValidLatitude(lat) && isValidLongitude(lng))) {
    return null;
  }
  return { lat, lng };
}

/**
 * One point per row that resolves to a valid coordinate. `skippedRowCount`
 * carries the rest so the view can say "12 rows aren't on the map" instead of
 * quietly showing fewer pins than the table has rows.
 */
export function buildMapPoints(
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  map: DatabaseMapConfig,
  primaryFieldId: string
): MapPointsResult {
  const labelField =
    fieldById(fields, map.labelFieldId) ?? fieldById(fields, primaryFieldId);
  const colorField = resolveMapColorField(fields, map);
  const points: MapPoint[] = [];
  let skippedRowCount = 0;

  for (const row of rows) {
    const coordinate = coordinateForRow(fields, map, row);
    if (!coordinate) {
      skippedRowCount += 1;
      continue;
    }
    const label = labelField
      ? cellToPlainText(labelField, row.values[labelField.id]).trim()
      : "";
    const optionId = colorField
      ? coerceCellValue(colorField, row.values[colorField.id])
      : null;
    points.push({
      ...coordinate,
      ...(typeof optionId === "string" && optionId !== ""
        ? { colorOptionId: optionId }
        : {}),
      label: label === "" ? "Untitled" : label,
      rowId: row.id,
    });
  }

  return { points, skippedRowCount };
}

/**
 * Bucket rows by their region code and reduce each bucket to one number.
 * Regions come back sorted by descending value so legends and tooltips lead
 * with the heaviest region.
 */
export function buildMapRegions(
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  map: DatabaseMapConfig
): MapRegionsResult {
  const joinField = resolveMapJoinField(fields, map);
  if (!joinField) {
    return { max: 0, min: 0, regions: [], skippedRowCount: rows.length };
  }
  const aggregate = map.valueAggregate ?? DEFAULT_MAP_VALUE_AGGREGATE;
  const valueField = resolveMapValueField(fields, map);
  const buckets = new Map<
    string,
    { label: string; rows: LocalDatabaseRow[] }
  >();
  let skippedRowCount = 0;

  for (const row of rows) {
    const raw = cellToPlainText(joinField, row.values[joinField.id]).trim();
    if (raw === "") {
      skippedRowCount += 1;
      continue;
    }
    const key = normalizeRegionKey(raw);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.rows.push(row);
      continue;
    }
    buckets.set(key, { label: raw, rows: [row] });
  }

  const regions: MapRegion[] = [];
  for (const [key, bucket] of buckets) {
    const value = reduceRegionValue(aggregate, valueField, bucket.rows);
    if (value === null) {
      continue;
    }
    regions.push({
      key,
      label: bucket.label,
      rowCount: bucket.rows.length,
      value,
    });
  }
  regions.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));

  const values = regions.map((region) => region.value);
  return {
    max: values.length === 0 ? 0 : Math.max(...values),
    min: values.length === 0 ? 0 : Math.min(...values),
    regions,
    skippedRowCount,
  };
}

function reduceRegionValue(
  aggregate: DatabaseMapValueAggregate,
  valueField: DatabaseField | null,
  rows: readonly LocalDatabaseRow[]
): number | null {
  if (aggregate === "count") {
    return rows.length;
  }
  if (!valueField) {
    return null;
  }
  const result = computeAggregate(
    aggregate as DatabaseAggregateFn,
    valueField,
    rows
  );
  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

/**
 * Ramp bucket (0-based, palest first) per region key. `linear` spreads the
 * value range evenly; `quantile` gives each bucket an equal share of regions,
 * which keeps a map readable when one region dwarfs the rest. A flat data set
 * (every value equal) lands entirely in the top bucket — one saturated shade
 * reads as "all the same", where the palest would read as "nearly nothing".
 */
export function assignRegionBuckets(
  regions: readonly MapRegion[],
  scale: DatabaseMapScale = DEFAULT_MAP_SCALE,
  bucketCount: number = MAP_REGION_BUCKET_COUNT
): Map<string, number> {
  const buckets = new Map<string, number>();
  if (regions.length === 0 || bucketCount < 1) {
    return buckets;
  }
  const top = bucketCount - 1;

  if (scale === "quantile") {
    const ordered = [...regions].sort((a, b) => a.value - b.value);
    for (const [index, region] of ordered.entries()) {
      const bucket = Math.floor((index * bucketCount) / ordered.length);
      buckets.set(region.key, Math.min(bucket, top));
    }
    return buckets;
  }

  const values = regions.map((region) => region.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) {
    for (const region of regions) {
      buckets.set(region.key, top);
    }
    return buckets;
  }
  for (const region of regions) {
    const ratio = (region.value - min) / (max - min);
    buckets.set(region.key, Math.min(Math.floor(ratio * bucketCount), top));
  }
  return buckets;
}

/** Bounding box over the plotted points, or `null` when there are none. */
export function boundsForPoints(points: readonly MapPoint[]): MapBounds | null {
  if (points.length === 0) {
    return null;
  }
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    west = Math.min(west, point.lng);
    east = Math.max(east, point.lng);
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

/** Display label for the region legend ("Count", "Sum of Revenue", …). */
export function mapValueLabel(
  aggregate: DatabaseMapValueAggregate,
  valueField: DatabaseField | null
): string {
  if (aggregate === "count" || valueField === null) {
    return CHART_Y_AGGREGATE_LABELS.count;
  }
  return `${CHART_Y_AGGREGATE_LABELS[aggregate]} of ${valueField.name}`;
}

const LATITUDE_NAME = /^(lat|latitude)$/i;
const LONGITUDE_NAME = /^(lng|lon|long|longitude)$/i;
const COORDINATE_NAME = /^(coord|coords|coordinates|location|lat ?lng)$/i;
const REGION_NAME = /^(country|country code|iso|nation|region)$/i;

/**
 * Per-type default config when a map view is created: two number fields named
 * like lat/lng become a pin map, a "coordinates"-ish text field becomes a
 * coordinate pin map, a country-ish field becomes a choropleth. Otherwise an
 * unconfigured pin map, which renders its own "pick a field" empty state —
 * the same shape as the chart view's creation defaults.
 */
export function guessMapConfig(
  fields: readonly DatabaseField[]
): DatabaseMapConfig {
  const numbers = mapLatLngFieldCandidates(fields);
  const latField = numbers.find((field) => LATITUDE_NAME.test(field.name));
  const lngField = numbers.find((field) => LONGITUDE_NAME.test(field.name));
  if (latField && lngField) {
    return { latFieldId: latField.id, lngFieldId: lngField.id, mark: "pins" };
  }

  const coordField = mapCoordinateFieldCandidates(fields).find((field) =>
    COORDINATE_NAME.test(field.name)
  );
  if (coordField) {
    return {
      coordFieldId: coordField.id,
      mark: "pins",
      pointMode: "coordinate",
    };
  }

  const joinField = mapJoinFieldCandidates(fields).find((field) =>
    REGION_NAME.test(field.name)
  );
  if (joinField) {
    return { joinFieldId: joinField.id, mark: "region" };
  }

  return { mark: "pins" };
}
