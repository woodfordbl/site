/**
 * @fileoverview The chart/map Y-aggregate taxonomy, in menu order.
 *
 * Its own module so both `database.ts` (the chart view config) and
 * `database-map-config.ts` (the region mark's value aggregate) can read one
 * list without importing each other. Menu labels derive from this order.
 */

/** Aggregates a chart Y axis or a choropleth region value may use. */
export const DATABASE_CHART_Y_AGGREGATES = [
  "count",
  "sum",
  "average",
  "min",
  "max",
] as const;
