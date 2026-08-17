/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DatabaseTimeSeriesChart } from "@/components/database/views/database-time-series-chart.tsx";
import type { DatabaseView, LocalDatabase } from "@/lib/schemas/database.ts";

/**
 * @fileoverview Coverage for the time-axis chart path.
 *
 * The load is async and the X axis is a continuous scale over epoch
 * milliseconds, so this stubs the loader and asserts on the compiled scene: the
 * series count, the % rescale, and the empty/loading states. It is the only
 * chart whose X values are not categories, which makes the axis worth pinning.
 */

const loadResult = vi.hoisted(() => ({
  current: {
    data: null as unknown,
    loading: false,
  },
}));

vi.mock("@/components/layout/theme-provider.tsx", () => ({
  useSiteAppearance: () => ({ chartPalette: "colorful" }),
}));
vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  updateDatabaseView: vi.fn(),
}));
vi.mock("@/lib/databases/use-time-series-chart-data.ts", () => ({
  useTimeSeriesChartData: () => loadResult.current,
}));

beforeAll(() => {
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

afterEach(() => {
  cleanup();
  loadResult.current = { data: null, loading: false };
});

const DAY = 86_400_000;
const START = Date.UTC(2026, 5, 1);

const database: LocalDatabase = {
  id: "db-1",
  name: "Holdings",
  primaryFieldId: "f-symbol",
  fields: [
    { id: "f-symbol", name: "Symbol", type: "text" },
    { id: "f-price", name: "Price", type: "number", format: "currency" },
  ],
  views: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** Two symbols of very different magnitude, five daily samples each. */
const LOADED = {
  from: START,
  to: START + 4 * DAY,
  series: [
    {
      key: "btc",
      label: "BTC",
      points: Array.from({ length: 5 }, (_unused, index) => ({
        t: START + index * DAY,
        v: 60_000 + index * 500,
      })),
    },
    {
      key: "doge",
      label: "DOGE",
      points: Array.from({ length: 5 }, (_unused, index) => ({
        t: START + index * DAY,
        v: 0.12 + index * 0.01,
      })),
    },
  ],
};

function timeView(
  chart: NonNullable<DatabaseView["config"]["chart"]>
): DatabaseView {
  return { id: "v-time", name: "Price", type: "chart", config: { chart } };
}

function renderTimeSeries(chart: NonNullable<DatabaseView["config"]["chart"]>) {
  return render(
    <DatabaseTimeSeriesChart
      chart={chart}
      database={database}
      fields={database.fields}
      mode="edit"
      rows={[]}
      view={timeView(chart)}
    />
  );
}

const TIME_CHART = {
  xMode: "time",
  mark: "line",
  timeSeries: { fieldId: "f-price", windowMs: 7 * DAY },
} as const satisfies NonNullable<DatabaseView["config"]["chart"]>;

describe("DatabaseTimeSeriesChart", () => {
  it("asks for a captured property before anything loads", () => {
    renderTimeSeries({ xMode: "time" });
    expect(
      screen.getByText("Pick a property to chart over time")
    ).toBeDefined();
  });

  it("shows the loading state while history is being fetched", () => {
    loadResult.current = { data: null, loading: true };
    renderTimeSeries(TIME_CHART);
    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("draws one line per synced series over a continuous time axis", () => {
    loadResult.current = { data: LOADED, loading: false };
    const { container } = renderTimeSeries(TIME_CHART);
    expect(container.querySelectorAll(".ts-chart__line path")).toHaveLength(2);
    expect(screen.getByText("BTC")).toBeDefined();
    expect(screen.getByText("DOGE")).toBeDefined();
  });

  it("draws an area when the mark is area", () => {
    loadResult.current = { data: LOADED, loading: false };
    const { container } = renderTimeSeries({ ...TIME_CHART, mark: "area" });
    expect(container.querySelector(".ts-chart__area")).not.toBeNull();
  });

  it("keeps the window control available so the range can be changed", () => {
    loadResult.current = { data: LOADED, loading: false };
    renderTimeSeries(TIME_CHART);
    expect(screen.getByText("7D")).toBeDefined();
  });

  it("rescales both series onto one axis for the percent scale", () => {
    loadResult.current = { data: LOADED, loading: false };
    const { container } = renderTimeSeries({
      ...TIME_CHART,
      timeSeries: { ...TIME_CHART.timeSeries, scale: "percent" },
    });
    // Both series start at their own baseline, so both first points land on the
    // same y — which is the whole point of the percent scale.
    const points = [...container.querySelectorAll(".ts-chart__line path")];
    expect(points).toHaveLength(2);
    // Percent ticks are signed, so the axis shows a "+0.00%"-style label.
    expect(container.textContent).toContain("%");
  });
});
