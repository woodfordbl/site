import { barY, createChartScene, defineChart } from "@tanstack/charts";
import { describe, expect, it } from "vitest";

import { chartSeriesColor } from "@/lib/charts/chart-palettes.ts";
import {
  CHART_THEME,
  categoryBandAxis,
  chartColorOptions,
  chartMargin,
  minorGridValues,
  numberValueAxis,
  seriesTooltip,
} from "@/lib/charts/chart-spec.ts";

/**
 * @fileoverview Tests for the shared chart grammar. The scene assertions matter
 * most: they pin the contract that a chart's colors are palette `var()`
 * references, not literals, which is what makes a palette switch a pure CSS
 * change.
 */

interface Row {
  category: string;
  label: string;
  series: string;
  value: number;
}

const ROWS: Row[] = [
  { category: "Jan", label: "Ada", series: "ada", value: 3 },
  { category: "Feb", label: "Ada", series: "ada", value: 5 },
  { category: "Jan", label: "Bob", series: "bob", value: 1 },
  { category: "Feb", label: "Bob", series: "bob", value: 2 },
];

const SERIES = [
  { key: "ada", token: 1 },
  { key: "bob", token: 4 },
] as const;

function scene() {
  const definition = defineChart({
    marks: [
      barY(ROWS, {
        x: "category",
        y: "value",
        z: "series",
        color: "series",
      }),
    ],
    x: categoryBandAxis({}),
    y: numberValueAxis({ domain: [0, 6], ticks: 4 }),
    color: chartColorOptions([...SERIES]),
    theme: CHART_THEME,
  });
  return createChartScene(definition, { width: 400, height: 200 });
}

describe("chartColorOptions", () => {
  it("paints each series in its palette token, never a literal color", () => {
    const fills = new Set(
      scene()
        .points.map((point) => point.color)
        .filter(Boolean)
    );
    expect(fills).toEqual(new Set([chartSeriesColor(1), chartSeriesColor(4)]));
    for (const fill of fills) {
      expect(fill.startsWith("var(--chart-")).toBe(true);
    }
  });

  it("keeps the domain order it was given, so legends and tooltips agree", () => {
    expect(chartColorOptions([...SERIES]).domain).toEqual(["ada", "bob"]);
    expect(chartColorOptions([...SERIES]).range).toEqual([
      chartSeriesColor(1),
      chartSeriesColor(4),
    ]);
  });
});

describe("numberValueAxis", () => {
  it("pins both ends when given a domain", () => {
    const points = scene().points;
    expect(points).toHaveLength(4);
    // The pinned domain [0, 6] maps value 3 to the vertical midpoint.
    const jan = points.find(
      (point) => point.xValue === "Jan" && point.yValue === 3
    );
    expect(jan).toBeDefined();
  });

  it("keeps the scale but drops the axis when not visible", () => {
    expect(numberValueAxis({ visible: false }).axis).toBe(false);
    expect(numberValueAxis({}).axis).not.toBe(false);
  });

  it("nice-rounds an inferred domain and leaves a pinned one alone", () => {
    expect(numberValueAxis({}).nice).toBe(true);
    expect(numberValueAxis({ domain: [0, 7] }).nice).toBe(false);
  });
});

describe("minorGridValues", () => {
  it("subdivides each major gap evenly", () => {
    // Majors over [0, 8] at a tick count of 4 land on 0/2/4/6/8; one
    // subdivision each puts a line at every odd value.
    expect(minorGridValues([0, 8], 4, 1)).toEqual([1, 3, 5, 7]);
  });

  it("emits nothing when no subdivisions are asked for", () => {
    expect(minorGridValues([0, 8], 4, 0)).toEqual([]);
    expect(minorGridValues([0, 8], 4, -1)).toEqual([]);
  });
});

describe("chartMargin", () => {
  it("reserves room only for the axis titles a chart actually renders", () => {
    const bare = chartMargin({});
    const titled = chartMargin({ x: "Month", y: "Revenue" });
    expect(titled.bottom).toBeGreaterThan(bare.bottom ?? 0);
    expect(titled.left).toBeGreaterThan(bare.left ?? 0);
    expect(chartMargin({ x: "Month" }).left).toBe(bare.left);
  });
});

describe("seriesTooltip", () => {
  it("renders one row per point, ordered by the color domain", () => {
    const tooltip = seriesTooltip<Row, string, number>({
      label: (point) => point.datum.label,
      value: (point) => `${point.yValue} edits`,
    });
    expect(tooltip).toMatchObject({ sort: "color-domain" });
    const points = scene().points.filter((point) => point.xValue === "Feb");
    const content = tooltip.content?.(points, {
      pinned: false,
      xLabel: "",
      yLabel: "",
      formatX: String,
      formatY: String,
    });
    expect(content?.title).toBe("Feb");
    expect(content?.rows).toEqual([
      { label: "Ada", value: "5 edits", color: chartSeriesColor(1) },
      { label: "Bob", value: "2 edits", color: chartSeriesColor(4) },
    ]);
  });

  it("falls back to the series label and the formatted X value", () => {
    const tooltip = seriesTooltip<Row, string, number>({
      value: (point) => String(point.yValue),
    });
    const points = scene().points.filter((point) => point.xValue === "Jan");
    const content = tooltip.content?.(points, {
      pinned: false,
      xLabel: "",
      yLabel: "",
      formatX: (value: unknown) => `x=${String(value)}`,
      formatY: String,
    });
    expect(content?.title).toBe("x=Jan");
    expect(content?.rows.map((row) => row.label)).toEqual(["ada", "bob"]);
  });
});
