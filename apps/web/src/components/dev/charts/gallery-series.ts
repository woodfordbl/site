import type { ChartLegendItem } from "@/components/charts/chart-legend.tsx";
import {
  BROWSER_ROWS,
  DEVICE_LABELS,
  type DeviceRow,
} from "@/components/dev/charts/chart-gallery-data.ts";
import {
  type ChartColorToken,
  chartSeriesColor,
  chartSeriesToken,
} from "@/lib/charts/chart-palettes.ts";
import type { ChartSeriesColor } from "@/lib/charts/chart-spec.ts";

/**
 * @fileoverview Series identities and legend items shared across the dev chart
 * gallery, so every variant of a mark colors and labels its series the same way
 * and the grid reads as one system rather than fourteen unrelated charts.
 */

/** Plot height for every chart in the gallery grid. */
export const GALLERY_PLOT_HEIGHT_PX = 200;

/** The three device series, on palette tokens 1-3. */
export const DEVICE_SERIES: readonly ChartSeriesColor[] = (
  ["desktop", "mobile", "tablet"] as const
).map((key, index) => ({ key, token: chartSeriesToken(index) }));

/** Desktop and mobile only, keeping the tokens the three-series set gives them. */
export const TWO_DEVICE_SERIES: readonly ChartSeriesColor[] =
  DEVICE_SERIES.slice(0, 2);

/** The browser rows as a color-scale domain, cycling tokens by rank. */
export const BROWSER_SERIES: readonly ChartSeriesColor[] = BROWSER_ROWS.map(
  (row, index) => ({ key: row.browser, token: chartSeriesToken(index) })
);

/** Legend items for a device-series subset, labelled from `DEVICE_LABELS`. */
export function deviceLegendItems(
  series: readonly ChartSeriesColor[]
): ChartLegendItem[] {
  return series.map((entry) => ({
    color: chartSeriesColor(entry.token),
    key: String(entry.key),
    label: DEVICE_LABELS[entry.key as DeviceRow["series"]],
  }));
}

/** Legend items for the browser rows, in rank order. */
export function browserLegendItems(): ChartLegendItem[] {
  return BROWSER_ROWS.map((row, index) => ({
    color: chartSeriesColor(chartSeriesToken(index)),
    key: row.browser,
    label: row.label,
  }));
}

/** The palette token a browser row paints in — its rank, cycled. */
export function browserToken(browser: string): ChartColorToken {
  const index = BROWSER_ROWS.findIndex((row) => row.browser === browser);
  return chartSeriesToken(index < 0 ? 0 : index);
}

/** Display label for a browser key, falling back to the key itself. */
export function browserLabel(browser: string): string {
  return BROWSER_ROWS.find((row) => row.browser === browser)?.label ?? browser;
}
