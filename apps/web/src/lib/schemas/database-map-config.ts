/**
 * @fileoverview Zod schema for a map saved view's `config.map`.
 *
 * Lives beside `database.ts` rather than inside it so the core database schema
 * stays readable as one document; `databaseTableViewConfigSchema` references
 * this as its `map` slot.
 *
 * Coordinates are read from ordinary fields (two numbers, or one "lat, lng"
 * string) rather than a dedicated location field type — see
 * docs/proposals/maps.md for that sequencing decision.
 */
import { z } from "zod";
import { DATABASE_CHART_Y_AGGREGATES } from "./database-chart-aggregates.ts";

/** Per-view map configuration — all field references are stable field ids. */
export const databaseMapViewConfigSchema = z.object({
  /**
   * Geometry the rows render as. `pins` (default) and `cluster` plot one
   * point per row over the tiled basemap; `region` joins rows to polygons
   * and shades them over a blank canvas.
   */
  mark: z.enum(["pins", "cluster", "region"]).optional(),
  /**
   * Where a row's point comes from. `location` reads one `location` field's
   * resolved coordinates and is what a map view guesses when the database has
   * one; `pair` reads two number fields; `coordinate` parses one text/formula
   * field holding "lat, lng". Absent means `pair`, which is what every view
   * saved before the `location` field type existed meant. Ignored by the
   * `region` mark.
   */
  pointMode: z.enum(["pair", "coordinate", "location"]).optional(),
  /** Latitude number field — `pointMode: "pair"`. */
  latFieldId: z.string().optional(),
  /** Longitude number field — `pointMode: "pair"`. */
  lngFieldId: z.string().optional(),
  /** Text/formula field holding "lat, lng" — `pointMode: "coordinate"`. */
  coordFieldId: z.string().optional(),
  /** Location field — `pointMode: "location"`. */
  locationFieldId: z.string().optional(),
  /** Marker label field; absent uses the primary (title) field. */
  labelFieldId: z.string().optional(),
  /** Select field whose option colors tint the markers. */
  colorFieldId: z.string().optional(),
  /** Row-side region code (select/text/formula) — `region` mark. */
  joinFieldId: z.string().optional(),
  /**
   * Feature property the row-side code matches, e.g. `ADM0_A3` (default)
   * or `NAME` on the bundled world countries source.
   */
  joinProperty: z.string().optional(),
  /** Number/formula field the region aggregate reduces. */
  valueFieldId: z.string().optional(),
  /** Region aggregate; shares the chart Y taxonomy. Absent = count. */
  valueAggregate: z.enum(DATABASE_CHART_Y_AGGREGATES).optional(),
  /**
   * Choropleth ramp. `linear` (default) spreads the raw value range over
   * the palette; `quantile` gives each bucket an equal share of regions,
   * which reads better when a few regions dominate.
   */
  scale: z.enum(["linear", "quantile"]).optional(),
  /** Chart palette id from lib/charts (absent = site default). */
  palette: z.string().optional(),
  /** Hover tooltip on markers/regions (absent = on). */
  showTooltip: z.boolean().optional(),
  /**
   * Properties listed under the tooltip title, in the order they were added
   * (a menu of switches has no drag handle to reorder with). Absent = none:
   * a tooltip shows the title alone unless someone asks for more, the same
   * default a board card starts from.
   */
  tooltipFieldIds: z.array(z.string()).optional(),
  /** Row icon before the tooltip title; absent = shown, like grid rows. */
  showTooltipIcon: z.boolean().optional(),
});
