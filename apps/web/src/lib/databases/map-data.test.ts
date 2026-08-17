import { describe, expect, it } from "vitest";

import {
  assignRegionBuckets,
  boundsForPoints,
  buildMapPoints,
  buildMapRegions,
  guessMapConfig,
  isMapConfigured,
  type MapRegion,
  normalizeRegionKey,
} from "@/lib/databases/map-data.ts";
import type {
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const TITLE: DatabaseField = { id: "f-title", name: "Name", type: "text" };
const LAT: DatabaseField = { id: "f-lat", name: "Latitude", type: "number" };
const LNG: DatabaseField = { id: "f-lng", name: "Longitude", type: "number" };
const COORD: DatabaseField = {
  id: "f-coord",
  name: "Coordinates",
  type: "text",
};
const PLACE: DatabaseField = { id: "f-place", name: "Place", type: "location" };
const REVENUE: DatabaseField = { id: "f-rev", name: "Revenue", type: "number" };
const COUNTRY: DatabaseField = {
  id: "f-country",
  name: "Country",
  options: [
    { id: "opt-usa", name: "USA", color: "blue" },
    { id: "opt-fra", name: "FRA", color: "green" },
  ],
  type: "select",
};
const STATUS: DatabaseField = {
  id: "f-status",
  name: "Status",
  options: [{ id: "opt-open", name: "Open", color: "green" }],
  type: "select",
};

const FIELDS = [TITLE, LAT, LNG, COORD, PLACE, REVENUE, COUNTRY, STATUS];

function row(id: string, values: LocalDatabaseRow["values"]): LocalDatabaseRow {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    databaseId: "db-1",
    id,
    updatedAt: "2026-01-01T00:00:00.000Z",
    values,
  };
}

describe("buildMapPoints", () => {
  it("projects lat/lng number pairs and labels from the primary field", () => {
    const rows = [
      row("r1", { "f-title": "HQ", "f-lat": 37.77, "f-lng": -122.41 }),
      row("r2", { "f-title": "Depot", "f-lat": 51.5, "f-lng": -0.12 }),
    ];
    const result = buildMapPoints(
      FIELDS,
      rows,
      { latFieldId: "f-lat", lngFieldId: "f-lng" },
      TITLE.id
    );
    expect(result.skippedRowCount).toBe(0);
    expect(result.points).toEqual([
      { label: "HQ", lat: 37.77, lng: -122.41, rowId: "r1" },
      { label: "Depot", lat: 51.5, lng: -0.12, rowId: "r2" },
    ]);
  });

  it("counts rows with missing or out-of-range coordinates instead of dropping them silently", () => {
    const rows = [
      row("r1", { "f-title": "Good", "f-lat": 10, "f-lng": 10 }),
      row("r2", { "f-title": "No lng", "f-lat": 10 }),
      row("r3", { "f-title": "Empty" }),
      row("r4", { "f-title": "Bad lat", "f-lat": 999, "f-lng": 10 }),
    ];
    const result = buildMapPoints(
      FIELDS,
      rows,
      { latFieldId: "f-lat", lngFieldId: "f-lng" },
      TITLE.id
    );
    expect(result.points).toHaveLength(1);
    expect(result.skippedRowCount).toBe(3);
  });

  it("reads one coordinate field in coordinate mode", () => {
    const rows = [
      row("r1", { "f-title": "Paris", "f-coord": "48.8566, 2.3522" }),
      row("r2", { "f-title": "Nowhere", "f-coord": "somewhere nice" }),
    ];
    const result = buildMapPoints(
      FIELDS,
      rows,
      { coordFieldId: "f-coord", pointMode: "coordinate" },
      TITLE.id
    );
    expect(result.points).toEqual([
      { label: "Paris", lat: 48.8566, lng: 2.3522, rowId: "r1" },
    ]);
    expect(result.skippedRowCount).toBe(1);
  });

  it("reads a location field's resolved coordinates", () => {
    const rows = [
      row("r1", {
        "f-place": {
          label: "Kourou, French Guiana",
          lat: 5.239,
          lng: -52.7683,
        },
        "f-title": "ELA-4",
      }),
      // An address nobody has geocoded yet: counted, never silently dropped.
      row("r2", {
        "f-place": { label: "221B Baker Street" },
        "f-title": "Flat",
      }),
      row("r3", { "f-title": "Blank" }),
    ];
    const result = buildMapPoints(
      FIELDS,
      rows,
      { locationFieldId: "f-place", pointMode: "location" },
      TITLE.id
    );
    expect(result.points).toEqual([
      { label: "ELA-4", lat: 5.239, lng: -52.7683, rowId: "r1" },
    ]);
    expect(result.skippedRowCount).toBe(2);
  });

  it("reads a location field holding a bare coordinate string", () => {
    // What a paste or a text→location type change leaves in the cell.
    const rows = [row("r1", { "f-place": "51.5, -0.12", "f-title": "London" })];
    const result = buildMapPoints(
      FIELDS,
      rows,
      { locationFieldId: "f-place", pointMode: "location" },
      TITLE.id
    );
    expect(result.points).toEqual([
      { label: "London", lat: 51.5, lng: -0.12, rowId: "r1" },
    ]);
  });

  it("carries the select option id for the color field and falls back to Untitled", () => {
    const rows = [
      row("r1", { "f-lat": 1, "f-lng": 2, "f-status": "opt-open" }),
    ];
    const [point] = buildMapPoints(
      FIELDS,
      rows,
      { colorFieldId: "f-status", latFieldId: "f-lat", lngFieldId: "f-lng" },
      TITLE.id
    ).points;
    expect(point.colorOptionId).toBe("opt-open");
    expect(point.label).toBe("Untitled");
  });

  it("skips every row when the configured fields are stale", () => {
    const rows = [row("r1", { "f-lat": 1, "f-lng": 2 })];
    const result = buildMapPoints(
      FIELDS,
      rows,
      { latFieldId: "f-gone", lngFieldId: "f-lng" },
      TITLE.id
    );
    expect(result.points).toHaveLength(0);
    expect(result.skippedRowCount).toBe(1);
  });
});

describe("buildMapRegions", () => {
  const rows = [
    row("r1", { "f-country": "opt-usa", "f-rev": 10 }),
    row("r2", { "f-country": "opt-usa", "f-rev": 30 }),
    row("r3", { "f-country": "opt-fra", "f-rev": 5 }),
    row("r4", { "f-rev": 99 }),
  ];

  it("counts rows per region by default and reports unjoinable rows", () => {
    const result = buildMapRegions(FIELDS, rows, { joinFieldId: "f-country" });
    expect(result.regions).toEqual([
      { key: "USA", label: "USA", rowCount: 2, value: 2 },
      { key: "FRA", label: "FRA", rowCount: 1, value: 1 },
    ]);
    expect(result.skippedRowCount).toBe(1);
    expect(result.min).toBe(1);
    expect(result.max).toBe(2);
  });

  it("reduces a numeric field with the shared chart aggregates", () => {
    const result = buildMapRegions(FIELDS, rows, {
      joinFieldId: "f-country",
      valueAggregate: "sum",
      valueFieldId: "f-rev",
    });
    expect(result.regions.map((region) => [region.key, region.value])).toEqual([
      ["USA", 40],
      ["FRA", 5],
    ]);
  });

  it("normalizes join keys case- and whitespace-insensitively", () => {
    const textRows = [
      row("r1", { "f-coord": "  united   states " }),
      row("r2", { "f-coord": "United States" }),
    ];
    const result = buildMapRegions(FIELDS, textRows, {
      joinFieldId: "f-coord",
    });
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]).toMatchObject({
      key: "UNITED STATES",
      rowCount: 2,
    });
  });

  it("returns nothing when the join field is unset or stale", () => {
    expect(buildMapRegions(FIELDS, rows, {}).regions).toEqual([]);
    expect(buildMapRegions(FIELDS, rows, { joinFieldId: "f-gone" })).toEqual({
      max: 0,
      min: 0,
      regions: [],
      skippedRowCount: rows.length,
    });
  });
});

describe("normalizeRegionKey", () => {
  it("upper-cases, trims and collapses whitespace", () => {
    expect(normalizeRegionKey("  côte  d'Ivoire ")).toBe("CÔTE D'IVOIRE");
  });
});

describe("assignRegionBuckets", () => {
  function regions(...values: number[]): MapRegion[] {
    return values.map((value, index) => ({
      key: `K${index}`,
      label: `K${index}`,
      rowCount: 1,
      value,
    }));
  }

  it("spreads a linear ramp across the value range", () => {
    const buckets = assignRegionBuckets(regions(0, 50, 100), "linear", 5);
    expect(buckets.get("K0")).toBe(0);
    expect(buckets.get("K1")).toBe(2);
    expect(buckets.get("K2")).toBe(4);
  });

  it("gives every region the top bucket when all values are equal", () => {
    const buckets = assignRegionBuckets(regions(7, 7, 7), "linear", 5);
    expect([...buckets.values()]).toEqual([4, 4, 4]);
  });

  it("splits regions evenly by rank on a quantile scale", () => {
    // One huge outlier would flatten a linear ramp; quantile keeps the spread.
    const buckets = assignRegionBuckets(
      regions(1, 2, 3, 4, 1000),
      "quantile",
      5
    );
    expect([...buckets.values()].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(buckets.get("K4")).toBe(4);
  });

  it("returns an empty map for no regions", () => {
    expect(assignRegionBuckets([], "linear", 5).size).toBe(0);
  });
});

describe("boundsForPoints", () => {
  it("returns the bounding box of the points", () => {
    expect(
      boundsForPoints([
        { label: "a", lat: 10, lng: -20, rowId: "r1" },
        { label: "b", lat: -5, lng: 30, rowId: "r2" },
      ])
    ).toEqual([
      [-20, -5],
      [30, 10],
    ]);
  });

  it("returns null with no points", () => {
    expect(boundsForPoints([])).toBeNull();
  });
});

describe("isMapConfigured", () => {
  it("requires both axes for a pair-mode pin map", () => {
    expect(isMapConfigured(FIELDS, { latFieldId: "f-lat" })).toBe(false);
    expect(
      isMapConfigured(FIELDS, { latFieldId: "f-lat", lngFieldId: "f-lng" })
    ).toBe(true);
  });

  it("requires a location field in location mode, and one of that type", () => {
    expect(isMapConfigured(FIELDS, { pointMode: "location" })).toBe(false);
    // A stale id, or one pointing at a field of another type, is unconfigured.
    expect(
      isMapConfigured(FIELDS, {
        locationFieldId: "f-title",
        pointMode: "location",
      })
    ).toBe(false);
    expect(
      isMapConfigured(FIELDS, {
        locationFieldId: "f-place",
        pointMode: "location",
      })
    ).toBe(true);
  });

  it("requires a join field for a region map", () => {
    expect(isMapConfigured(FIELDS, { mark: "region" })).toBe(false);
    expect(
      isMapConfigured(FIELDS, { joinFieldId: "f-country", mark: "region" })
    ).toBe(true);
  });
});

describe("guessMapConfig", () => {
  it("prefers a location field over every derived source", () => {
    expect(guessMapConfig(FIELDS)).toEqual({
      locationFieldId: "f-place",
      mark: "pins",
      pointMode: "location",
    });
  });

  it("pairs number fields named like latitude and longitude", () => {
    expect(guessMapConfig([TITLE, LAT, LNG, COORD, COUNTRY])).toEqual({
      latFieldId: "f-lat",
      lngFieldId: "f-lng",
      mark: "pins",
    });
  });

  it("falls back to a coordinate text field", () => {
    expect(guessMapConfig([TITLE, COORD])).toEqual({
      coordFieldId: "f-coord",
      mark: "pins",
      pointMode: "coordinate",
    });
  });

  it("falls back to a country field as a choropleth", () => {
    expect(guessMapConfig([TITLE, COUNTRY])).toEqual({
      joinFieldId: "f-country",
      mark: "region",
    });
  });

  it("returns an unconfigured pin map when nothing matches", () => {
    expect(guessMapConfig([TITLE, STATUS])).toEqual({ mark: "pins" });
  });
});
