/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DatabaseChartView } from "@/components/database/views/database-chart-view.tsx";
import type {
  DatabaseView,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

// The chart wrapper reads the workspace palette/dither from the appearance
// context; stub it so the test needs no ThemeProvider scaffolding.
vi.mock("@/hooks/device-layout.ts", () => ({
  useIsCoarsePrimaryPointer: () => false,
}));
vi.mock("@/components/layout/theme-provider.tsx", () => ({
  useSiteAppearance: () => ({
    chartPalette: "colorful",
    chartDitherEnabled: false,
  }),
}));
// Config writes go through the collection ops; the menu is render-only here.
vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  updateDatabaseView: vi.fn(),
}));

beforeAll(() => {
  // jsdom lacks matchMedia (reduced-motion probe) and ResizeObserver
  // (Recharts ResponsiveContainer + the dither hook).
  // Report reduced motion so marks render without animation frames (jsdom
  // has no rAF-driven layout) — this also exercises the motion-reduce path.
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
  // Fire immediately with a fixed size so ResponsiveContainer lays out the
  // plot (jsdom reports 0×0 from getBoundingClientRect).
  const FAKE_RECT = {
    width: 640,
    height: 320,
    top: 0,
    left: 0,
    bottom: 320,
    right: 640,
    x: 0,
    y: 0,
    toJSON: () => "",
  };
  window.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element): void {
      this.callback(
        [
          {
            target,
            contentRect: FAKE_RECT,
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          } as unknown as ResizeObserverEntry,
        ],
        this
      );
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

describe("DatabaseChartView", () => {
  it("renders a series-split bar chart with a legend", () => {
    render(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="edit"
        rows={ROWS}
        view={chartView({
          mark: "bar",
          xFieldId: "f-status",
          seriesFieldId: "f-owner",
        })}
      />
    );
    // Legend defaults on for >1 series, one entry per owner option.
    expect(screen.getByText("Ada")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();
    // The chart carries no inline settings control — config lives in the
    // database ⋯ settings menu's "Chart" submenu now.
    expect(screen.queryByLabelText("Chart settings")).toBeNull();
  });

  it("renders the chart in view mode", () => {
    const { container } = render(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="view"
        rows={ROWS}
        view={chartView({
          mark: "bar",
          xFieldId: "f-status",
          seriesFieldId: "f-owner",
        })}
      />
    );
    expect(container.querySelector("[data-chart]")).not.toBeNull();
  });

  it("applies the view's palette to the chart container", () => {
    const { container } = render(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="view"
        rows={ROWS}
        view={chartView({ xFieldId: "f-status", palette: "blue" })}
      />
    );
    expect(
      container.querySelector('[data-chart-palette="blue"]')
    ).not.toBeNull();
  });

  it("asks for an X field when none is configured", () => {
    render(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="edit"
        rows={ROWS}
        view={chartView({})}
      />
    );
    expect(screen.getByText("Pick a field to chart")).toBeDefined();
  });

  it("guides toward a number property for non-count aggregates", () => {
    render(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="edit"
        rows={ROWS}
        view={chartView({ xFieldId: "f-status", yAggregate: "sum" })}
      />
    );
    expect(screen.getByText("Sum needs a number property")).toBeDefined();
  });

  it("renders a pie with one legend entry per category", async () => {
    render(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="view"
        rows={ROWS}
        view={chartView({ mark: "pie", xFieldId: "f-status" })}
      />
    );
    // Pie sectors (and their legend payload) land a frame after mount.
    expect(await screen.findByText("Todo")).toBeDefined();
    expect(await screen.findByText("Done")).toBeDefined();
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
    const { container, rerender } = render(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="edit"
        rows={ROWS}
        view={chartView({ mark: "bar", xFieldId: "f-status" })}
      />
    );
    // Single series: legend is off by default.
    expect(container.querySelector(".recharts-legend-wrapper")).toBeNull();
    rerender(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="edit"
        rows={ROWS}
        view={chartView({
          mark: "bar",
          xFieldId: "f-status",
          showLegend: true,
        })}
      />
    );
    expect(container.querySelector(".recharts-legend-wrapper")).not.toBeNull();
  });

  it("hides the tooltip layer when showTooltip is false", () => {
    const { container, rerender } = render(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="view"
        rows={ROWS}
        view={chartView({ mark: "bar", xFieldId: "f-status" })}
      />
    );
    // Recharts renders the tooltip wrapper (inactive) whenever a Tooltip mounts.
    expect(container.querySelector(".recharts-tooltip-wrapper")).not.toBeNull();
    rerender(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="view"
        rows={ROWS}
        view={chartView({
          mark: "bar",
          xFieldId: "f-status",
          showTooltip: false,
        })}
      />
    );
    expect(container.querySelector(".recharts-tooltip-wrapper")).toBeNull();
  });

  it("draws dashed minor gridlines when gridMinor is set", () => {
    const { container } = render(
      <DatabaseChartView
        database={database}
        fields={database.fields}
        mode="view"
        rows={ROWS}
        view={chartView({
          mark: "line",
          xFieldId: "f-status",
          gridCount: 4,
          gridMinor: 1,
        })}
      />
    );
    expect(
      container.querySelector('line[stroke-dasharray="2 4"]')
    ).not.toBeNull();
  });
});
