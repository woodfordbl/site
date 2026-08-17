/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DatabaseChartView } from "@/components/database/views/database-chart-view.tsx";
import type {
  DatabaseView,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

// The chart frame reads the workspace palette from the appearance context; stub
// it so the test needs no ThemeProvider scaffolding.
vi.mock("@/components/layout/device-layout-provider.tsx", async (orig) => ({
  ...(await orig<object>()),
  useIsCoarsePrimaryPointer: () => false,
}));
vi.mock("@/components/layout/theme-provider.tsx", () => ({
  useSiteAppearance: () => ({ chartPalette: "colorful" }),
}));
// Config writes go through the collection ops; the menu is render-only here.
vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  updateDatabaseView: vi.fn(),
}));

beforeAll(() => {
  // jsdom lacks matchMedia (the motion renderer's reduced-motion probe) and
  // ResizeObserver (the chart host's width tracking). Reporting reduced motion
  // makes the renderer paint its final frame synchronously, which is what lets
  // these assertions read the scene without waiting on animation frames.
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.ResizeObserver = class {
    observe(): void {
      return;
    }
    unobserve(): void {
      return;
    }
    disconnect(): void {
      return;
    }
  };
});

afterEach(cleanup);

const database: LocalDatabase = {
  id: "db-1",
  name: "Tasks",
  primaryFieldId: "f-name",
  fields: [
    { id: "f-name", name: "Name", type: "text" },
    {
      id: "f-status",
      name: "Status",
      type: "select",
      options: [
        { id: "opt-todo", name: "Todo" },
        { id: "opt-done", name: "Done" },
      ],
    },
    {
      id: "f-owner",
      name: "Owner",
      type: "select",
      options: [
        { id: "opt-ada", name: "Ada" },
        { id: "opt-bob", name: "Bob" },
      ],
    },
    { id: "f-price", name: "Price", type: "number", format: "currency" },
  ],
  views: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function chartView(
  chart: NonNullable<DatabaseView["config"]["chart"]>
): DatabaseView {
  return { id: "v-chart", name: "Chart", type: "chart", config: { chart } };
}

let nextRowId = 0;

function row(values: LocalDatabaseRow["values"]): LocalDatabaseRow {
  nextRowId += 1;
  return {
    id: `row-${nextRowId}`,
    databaseId: database.id,
    values,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const ROWS = [
  row({ "f-status": "opt-todo", "f-owner": "opt-ada", "f-price": 10 }),
  row({ "f-status": "opt-todo", "f-owner": "opt-bob", "f-price": 20 }),
  row({ "f-status": "opt-done", "f-owner": "opt-ada", "f-price": 5 }),
];

/** Renders a chart saved view over `ROWS` with the given chart config. */
function renderChart(chart: NonNullable<DatabaseView["config"]["chart"]>) {
  return render(
    <DatabaseChartView
      database={database}
      fields={database.fields}
      mode="edit"
      rows={ROWS}
      view={chartView(chart)}
    />
  );
}

describe("DatabaseChartView", () => {
  it("renders a series-split bar chart with a legend", () => {
    renderChart({
      mark: "bar",
      xFieldId: "f-status",
      seriesFieldId: "f-owner",
    });
    // Legend defaults on for >1 series, one entry per owner option.
    expect(screen.getByText("Ada")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();
    // The chart carries no inline settings control — config lives in the
    // database ⋯ settings menu's "Chart" submenu now.
    expect(screen.queryByLabelText("Chart settings")).toBeNull();
  });

  it("paints one bar per category and series", () => {
    const { container } = renderChart({
      mark: "bar",
      xFieldId: "f-status",
      seriesFieldId: "f-owner",
    });
    // Two categories × two owners, stacked or grouped, is four rects.
    expect(container.querySelectorAll(".ts-chart__bar rect")).toHaveLength(4);
  });

  it("applies the view's palette to the chart frame", () => {
    const { container } = renderChart({
      xFieldId: "f-status",
      palette: "blue",
    });
    expect(
      container.querySelector('[data-chart-palette="blue"]')
    ).not.toBeNull();
  });

  it("falls back to the workspace palette when the view sets none", () => {
    const { container } = renderChart({ xFieldId: "f-status" });
    expect(
      container.querySelector('[data-chart-palette="colorful"]')
    ).not.toBeNull();
  });

  it("asks for an X field when none is configured", () => {
    renderChart({});
    expect(screen.getByText("Pick a field to chart")).toBeDefined();
  });

  it("guides toward a number property for non-count aggregates", () => {
    renderChart({ xFieldId: "f-status", yAggregate: "sum" });
    expect(screen.getByText("Sum needs a number property")).toBeDefined();
  });

  it("renders a pie with one legend entry per category", () => {
    renderChart({ mark: "pie", xFieldId: "f-status" });
    expect(screen.getByText("Todo")).toBeDefined();
    expect(screen.getByText("Done")).toBeDefined();
  });

  it("shows the empty-data state when no rows match", () => {
    render(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="view"
        rows={[]}
        view={chartView({ xFieldId: "f-status" })}
      />
    );
    expect(screen.getByText("No data to chart")).toBeDefined();
  });

  it("toggles the legend for a single-series chart via showLegend", () => {
    renderChart({ mark: "bar", xFieldId: "f-status" });
    // Single series: legend is off by default, so its label is absent.
    expect(screen.queryByText("Count")).toBeNull();
    cleanup();
    renderChart({ mark: "bar", xFieldId: "f-status", showLegend: true });
    expect(screen.getByText("Count")).toBeDefined();
  });

  it("draws dashed minor gridlines when gridMinor is set", () => {
    const { container } = renderChart({
      mark: "line",
      xFieldId: "f-status",
      gridCount: 4,
      gridMinor: 1,
    });
    expect(
      container.querySelector('line[stroke-dasharray="2 4"]')
    ).not.toBeNull();
  });

  it("omits the axes and grid layers when the grid is turned off", () => {
    const { container } = renderChart({
      mark: "bar",
      xFieldId: "f-status",
      showGrid: false,
    });
    expect(container.querySelector(".ts-chart__grid")).toBeNull();
  });
});
