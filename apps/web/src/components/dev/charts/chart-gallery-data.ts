/**
 * @fileoverview Fixed sample datasets for the dev chart gallery.
 *
 * Every dataset is a literal so the gallery is deterministic: two renders of the
 * same chart are pixel-identical, which is what makes the palette toggle a
 * usable comparison and the page a usable visual reference. Shapes mirror the
 * tidy rows real charts feed their marks (`chart-series-rows.ts`) — one row per
 * plotted point, with a series column rather than a column per series.
 */

/** One month's value for one device series. */
export interface DeviceRow {
  month: string;
  series: "desktop" | "mobile" | "tablet";
  value: number;
}

/** Display labels for the device series, keyed by series value. */
export const DEVICE_LABELS: Record<DeviceRow["series"], string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"] as const;

const DEVICE_VALUES: Record<DeviceRow["series"], readonly number[]> = {
  desktop: [186, 305, 237, 273, 209, 264],
  mobile: [80, 200, 120, 190, 130, 140],
  tablet: [45, 62, 51, 88, 70, 74],
};

/** Three device series over six months, as tidy rows. */
export const DEVICE_ROWS: readonly DeviceRow[] = (
  ["desktop", "mobile", "tablet"] as const
).flatMap((series) =>
  MONTHS.map((month, index) => ({
    month,
    series,
    value: DEVICE_VALUES[series][index],
  }))
);

/** Just the desktop series — the single-series charts. */
export const DESKTOP_ROWS: readonly DeviceRow[] = DEVICE_ROWS.filter(
  (row) => row.series === "desktop"
);

/** Desktop and mobile — the two-series charts. */
export const TWO_DEVICE_ROWS: readonly DeviceRow[] = DEVICE_ROWS.filter(
  (row) => row.series !== "tablet"
);

/** One month's net change, signed — the diverging-bar chart. */
export interface NetChangeRow {
  month: string;
  value: number;
}

export const NET_CHANGE_ROWS: readonly NetChangeRow[] = [
  { month: "Jan", value: 186 },
  { month: "Feb", value: -95 },
  { month: "Mar", value: 237 },
  { month: "Apr", value: -173 },
  { month: "May", value: 109 },
  { month: "Jun", value: 214 },
];

/** One browser's visitor count — the horizontal-bar, pie, and radial charts. */
export interface BrowserRow {
  browser: string;
  label: string;
  visitors: number;
}

export const BROWSER_ROWS: readonly BrowserRow[] = [
  { browser: "chrome", label: "Chrome", visitors: 275 },
  { browser: "safari", label: "Safari", visitors: 200 },
  { browser: "firefox", label: "Firefox", visitors: 187 },
  { browser: "edge", label: "Edge", visitors: 173 },
  { browser: "other", label: "Other", visitors: 90 },
];

/** Total visitors across the browser rows — the donut's center readout. */
export const BROWSER_TOTAL = BROWSER_ROWS.reduce(
  (sum, row) => sum + row.visitors,
  0
);

/** One radar spoke's value for one series. */
export interface RadarRow {
  month: string;
  series: "desktop" | "mobile";
  value: number;
}

const RADAR_VALUES: Record<RadarRow["series"], readonly number[]> = {
  desktop: [186, 305, 237, 273, 209, 264],
  mobile: [160, 190, 250, 200, 240, 180],
};

export const RADAR_ROWS: readonly RadarRow[] = (
  ["desktop", "mobile"] as const
).flatMap((series) =>
  MONTHS.map((month, index) => ({
    month,
    series,
    value: RADAR_VALUES[series][index],
  }))
);

/** The radar's spoke order — the angular scale's domain. */
export const RADAR_MONTHS: readonly string[] = MONTHS;

/** Upper bound for the radar's radial scale, with headroom above the peak. */
export const RADAR_MAX = 340;

/** Plain grouped formatting — every gallery chart reads counts, not currency. */
const COUNT_FORMATTER = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return COUNT_FORMATTER.format(value);
}
