import { describe, expect, it } from "vitest";

import {
  buildChartData,
  CHART_SINGLE_SERIES_KEY,
  chartColorOverride,
  chartTokenIndex,
  chartValueLabel,
  chartXFieldCandidates,
  chartYFieldCandidates,
  formatChartYValue,
  resolveChartPaletteId,
  resolveChartSeriesField,
  resolveChartXField,
  resolveChartYField,
} from "@/lib/databases/chart-data.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const statusField: DatabaseField = {
  id: "f-status",
  name: "Status",
  type: "select",
  options: [
    { id: "opt-todo", name: "Todo", color: "blue" },
    { id: "opt-doing", name: "Doing" },
    { id: "opt-done", name: "Done", color: "green" },
  ],
};

const ownerField: DatabaseField = {
  id: "f-owner",
  name: "Owner",
  type: "select",
  options: [
    { id: "opt-ada", name: "Ada" },
    { id: "opt-bob", name: "Bob" },
  ],
};

const priceField: DatabaseField = {
  id: "f-price",
  name: "Price",
  type: "number",
  format: "currency",
};

const dueField: DatabaseField = { id: "f-due", name: "Due", type: "date" };

const notesField: DatabaseField = {
  id: "f-notes",
  name: "Notes",
  type: "text",
};

const totalField: DatabaseField = {
  id: "f-total",
  name: "Total",
  type: "formula",
  expression: "1 + 1",
};

const FIELDS: DatabaseField[] = [
  statusField,
  ownerField,
  priceField,
  dueField,
  notesField,
  totalField,
];

let nextRowId = 0;

function row(values: Record<string, DatabaseCellValue>): LocalDatabaseRow {
  nextRowId += 1;
  return {
    id: `row-${nextRowId}`,
    databaseId: "db-1",
    values,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("field resolvers", () => {
  it("offers groupable fields for X and numeric-capable fields for Y", () => {
    expect(chartXFieldCandidates(FIELDS).map((field) => field.id)).toEqual([
      "f-status",
      "f-owner",
      "f-price",
      "f-due",
      "f-notes",
    ]);
    expect(chartYFieldCandidates(FIELDS).map((field) => field.id)).toEqual([
      "f-price",
      "f-total",
    ]);
  });

  it("resolves X/Y/series fields and drops stale or invalid ids", () => {
    expect(resolveChartXField(FIELDS, { xFieldId: "f-status" })?.id).toBe(
      "f-status"
    );
    expect(resolveChartXField(FIELDS, { xFieldId: "f-total" })).toBeNull();
    expect(resolveChartXField(FIELDS, { xFieldId: "gone" })).toBeNull();
    expect(resolveChartXField(FIELDS, {})).toBeNull();

    expect(
      resolveChartYField(FIELDS, { yAggregate: "sum", yFieldId: "f-price" })?.id
    ).toBe("f-price");
    expect(
      resolveChartYField(FIELDS, { yAggregate: "sum", yFieldId: "f-notes" })
    ).toBeNull();
    // Count never needs a Y field.
    expect(
      resolveChartYField(FIELDS, { yAggregate: "count", yFieldId: "f-price" })
    ).toBeNull();

    expect(
      resolveChartSeriesField(FIELDS, { seriesFieldId: "f-owner" })?.id
    ).toBe("f-owner");
    expect(
      resolveChartSeriesField(FIELDS, { seriesFieldId: "f-total" })
    ).toBeNull();
  });

  it("validates palette ids and color overrides", () => {
    expect(resolveChartPaletteId("blue")).toBe("blue");
    expect(resolveChartPaletteId("neon")).toBeUndefined();
    expect(resolveChartPaletteId(undefined)).toBeUndefined();

    const chart = {
      colorOverrides: { a: 3, b: 0, c: 6, d: 2.5, e: Number.NaN },
    };
    expect(chartColorOverride(chart, "a")).toBe(3);
    expect(chartColorOverride(chart, "b")).toBeUndefined();
    expect(chartColorOverride(chart, "c")).toBeUndefined();
    expect(chartColorOverride(chart, "d")).toBeUndefined();
    expect(chartColorOverride(chart, "e")).toBeUndefined();
    expect(chartColorOverride({}, "a")).toBeUndefined();
  });

  it("cycles token indexes by position unless overridden", () => {
    expect(chartTokenIndex(undefined, 0)).toBe(1);
    expect(chartTokenIndex(undefined, 4)).toBe(5);
    expect(chartTokenIndex(undefined, 5)).toBe(1);
    expect(chartTokenIndex(4, 0)).toBe(4);
  });
});

describe("buildChartData", () => {
  it("returns the empty dataset without a resolvable X field", () => {
    const rows = [row({ "f-status": "opt-todo" })];
    expect(buildChartData(FIELDS, rows, {})).toEqual({
      categories: [],
      categoryKeys: [],
      series: [],
    });
    expect(buildChartData(FIELDS, rows, { xFieldId: "gone" }).series).toEqual(
      []
    );
  });

  it("returns the empty dataset when a non-count aggregate lacks a Y field", () => {
    const rows = [row({ "f-status": "opt-todo", "f-price": 5 })];
    const chart = { xFieldId: "f-status", yAggregate: "sum" as const };
    expect(buildChartData(FIELDS, rows, chart).categories).toEqual([]);
    expect(
      buildChartData(FIELDS, rows, { ...chart, yFieldId: "f-notes" }).categories
    ).toEqual([]);
  });

  it("counts rows per select bucket in option order with the empty bucket last", () => {
    const rows = [
      row({ "f-status": "opt-done" }),
      row({ "f-status": "opt-todo" }),
      row({}),
      row({ "f-status": "opt-todo" }),
    ];
    const data = buildChartData(FIELDS, rows, { xFieldId: "f-status" });
    expect(data.categories).toEqual(["Todo", "Done", "No Status"]);
    expect(data.categoryKeys).toEqual(["opt-todo", "opt-done", ""]);
    expect(data.series).toHaveLength(1);
    expect(data.series[0].key).toBe(CHART_SINGLE_SERIES_KEY);
    expect(data.series[0].label).toBe("Count");
    expect(data.series[0].points).toEqual([2, 1, 1]);
  });

  it("orders date buckets ascending by ISO key", () => {
    const rows = [
      row({ "f-due": "2026-03-05" }),
      row({ "f-due": "2026-01-20" }),
      row({ "f-due": "2026-03-05" }),
    ];
    const data = buildChartData(FIELDS, rows, { xFieldId: "f-due" });
    expect(data.categoryKeys).toEqual(["2026-01-20", "2026-03-05"]);
    expect(data.series[0].points).toEqual([1, 2]);
  });

  it("sums the Y field per bucket, skipping empty and mistyped cells", () => {
    const rows = [
      row({ "f-status": "opt-todo", "f-price": 10 }),
      row({ "f-status": "opt-todo", "f-price": 2.5 }),
      row({ "f-status": "opt-todo" }),
      row({ "f-status": "opt-done", "f-price": "oops" }),
    ];
    const data = buildChartData(FIELDS, rows, {
      xFieldId: "f-status",
      yAggregate: "sum",
      yFieldId: "f-price",
    });
    expect(data.series[0].label).toBe("Sum of Price");
    // Done has a row but no numeric values: sum of none is 0.
    expect(data.series[0].points).toEqual([12.5, 0]);
  });

  it("renders value-less buckets as null gaps for line marks and 0 for bars", () => {
    const rows = [
      row({ "f-status": "opt-todo", "f-price": 4 }),
      row({ "f-status": "opt-done" }),
    ];
    const chart = {
      xFieldId: "f-status",
      yAggregate: "average" as const,
      yFieldId: "f-price",
    };
    expect(
      buildChartData(FIELDS, rows, { ...chart, mark: "line" }).series[0].points
    ).toEqual([4, null]);
    expect(
      buildChartData(FIELDS, rows, { ...chart, mark: "area" }).series[0].points
    ).toEqual([4, null]);
    expect(
      buildChartData(FIELDS, rows, { ...chart, mark: "bar" }).series[0].points
    ).toEqual([4, 0]);
  });

  it("splits into series by the series field in option order", () => {
    const rows = [
      row({ "f-status": "opt-todo", "f-owner": "opt-bob" }),
      row({ "f-status": "opt-todo", "f-owner": "opt-ada" }),
      row({ "f-status": "opt-done", "f-owner": "opt-ada" }),
      row({ "f-status": "opt-done" }),
    ];
    const data = buildChartData(FIELDS, rows, {
      mark: "bar",
      xFieldId: "f-status",
      seriesFieldId: "f-owner",
    });
    expect(data.categories).toEqual(["Todo", "Done"]);
    expect(data.series.map((entry) => entry.key)).toEqual([
      "opt-ada",
      "opt-bob",
      "",
    ]);
    expect(data.series.map((entry) => entry.label)).toEqual([
      "Ada",
      "Bob",
      "No Owner",
    ]);
    expect(data.series.map((entry) => entry.points)).toEqual([
      [1, 1],
      [1, 0],
      [0, 1],
    ]);
  });

  it("leaves gaps for missing series×category cells on line marks", () => {
    const rows = [
      row({ "f-status": "opt-todo", "f-owner": "opt-ada", "f-price": 3 }),
      row({ "f-status": "opt-done", "f-owner": "opt-bob", "f-price": 7 }),
    ];
    const data = buildChartData(FIELDS, rows, {
      mark: "line",
      xFieldId: "f-status",
      seriesFieldId: "f-owner",
      yAggregate: "max",
      yFieldId: "f-price",
    });
    expect(data.series.map((entry) => entry.points)).toEqual([
      [3, null],
      [null, 7],
    ]);
  });

  it("ignores the series field for pie marks (single series over categories)", () => {
    const rows = [
      row({ "f-status": "opt-todo", "f-owner": "opt-ada" }),
      row({ "f-status": "opt-done", "f-owner": "opt-bob" }),
    ];
    const data = buildChartData(FIELDS, rows, {
      mark: "pie",
      xFieldId: "f-status",
      seriesFieldId: "f-owner",
    });
    expect(data.series).toHaveLength(1);
    expect(data.series[0].points).toEqual([1, 1]);
  });

  it("attaches validated color overrides to matching series keys", () => {
    const rows = [
      row({ "f-status": "opt-todo", "f-owner": "opt-ada" }),
      row({ "f-status": "opt-todo", "f-owner": "opt-bob" }),
    ];
    const data = buildChartData(FIELDS, rows, {
      xFieldId: "f-status",
      seriesFieldId: "f-owner",
      colorOverrides: { "opt-ada": 5, "opt-bob": 9 },
    });
    expect(data.series[0].color).toBe(5);
    expect(data.series[1].color).toBeUndefined();
  });

  it("aggregates formula fields over their computed numeric values", () => {
    const rows = [
      row({ "f-status": "opt-todo", "f-total": 2 }),
      row({ "f-status": "opt-todo", "f-total": "not a number" }),
    ];
    const data = buildChartData(FIELDS, rows, {
      xFieldId: "f-status",
      yAggregate: "sum",
      yFieldId: "f-total",
    });
    expect(data.series[0].points).toEqual([2]);
  });

  it("is deterministic for identical input", () => {
    const rows = [
      row({ "f-status": "opt-doing", "f-price": 1 }),
      row({ "f-status": "opt-todo", "f-price": 2 }),
    ];
    const chart = {
      xFieldId: "f-status",
      yAggregate: "sum" as const,
      yFieldId: "f-price",
    };
    expect(buildChartData(FIELDS, rows, chart)).toEqual(
      buildChartData(FIELDS, rows, chart)
    );
  });
});

describe("labels and formatting", () => {
  it("labels the unsplit series from the aggregate and Y field", () => {
    expect(chartValueLabel("count", null)).toBe("Count");
    expect(chartValueLabel("average", priceField)).toBe("Average of Price");
    expect(chartValueLabel("sum", null)).toBe("Count");
  });

  it("formats Y values with the number field's display config", () => {
    expect(formatChartYValue("sum", priceField, 1234.5)).toBe("$1,234.50");
    expect(formatChartYValue("count", null, 1234)).toBe("1,234");
    expect(formatChartYValue("sum", totalField, 1234.5)).toBe("1,234.5");
  });
});
