/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ASSET_CLASS_CRYPTO } from "@/lib/connectors/live-markets.ts";
import { useTimeSeriesChartData } from "@/lib/databases/use-time-series-chart-data.ts";
import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const HOUR_MS = 3_600_000;

const historyMocks = vi.hoisted(() => {
  const series = new Map<string, { t: number; v: number }[]>();
  const keyOf = (databaseId: string, externalId: string, fieldId: string) =>
    `${databaseId}:${externalId}:${fieldId}`;
  return {
    series,
    readFieldHistory: vi.fn(
      (databaseId: string, externalId: string, fieldId: string) =>
        Promise.resolve([
          ...(series.get(keyOf(databaseId, externalId, fieldId)) ?? []),
        ])
    ),
    mergeFieldHistory: vi.fn(
      (
        batches: {
          databaseId: string;
          externalId: string;
          fieldId: string;
          points: { t: number; v: number }[];
        }[]
      ) => {
        for (const batch of batches) {
          series.set(keyOf(batch.databaseId, batch.externalId, batch.fieldId), [
            ...batch.points,
          ]);
        }
        return Promise.resolve();
      }
    ),
    peekFieldHistory: vi.fn(() => []),
  };
});

const fetchHistory = vi.hoisted(() => {
  const hourMs = 3_600_000;
  return vi.fn(async () => [
    { t: Date.now() - 3 * hourMs, v: 10 },
    { t: Date.now() - 2 * hourMs, v: 11 },
  ]);
});

vi.mock("@/db/history/field-history-store.ts", () => ({
  readFieldHistory: historyMocks.readFieldHistory,
  mergeFieldHistory: historyMocks.mergeFieldHistory,
  peekFieldHistory: historyMocks.peekFieldHistory,
}));
vi.mock("@/lib/connectors/registry.ts", () => ({
  getConnector: () => ({ id: "live-markets", fetchHistory }),
}));
vi.mock("@/lib/connectors/token-store.ts", () => ({
  getConnectorToken: () => undefined,
}));

const FIELDS: DatabaseField[] = [
  { id: "f-symbol", name: "Symbol", type: "text", sourceKey: "symbol" },
  {
    id: "f-class",
    name: "Asset class",
    type: "select",
    sourceKey: "assetClass",
    options: [{ id: ASSET_CLASS_CRYPTO, name: "Crypto" }],
  },
  {
    id: "f-price",
    name: "Price",
    type: "number",
    sourceKey: "price",
    captureHistory: true,
  },
];

const DATABASE: LocalDatabase = {
  id: "db-1",
  name: "Markets",
  primaryFieldId: "f-symbol",
  source: {
    kind: "connector",
    connectorId: "live-markets",
    config: {
      instruments: [{ symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO }],
      currency: "USD",
    },
  },
  fields: FIELDS,
  views: [{ id: "v-1", name: "Chart", type: "chart", config: {} }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ROWS: LocalDatabaseRow[] = [
  {
    id: "row-1",
    databaseId: "db-1",
    externalId: "BTC",
    values: {
      "f-symbol": "BTC",
      "f-class": ASSET_CLASS_CRYPTO,
      "f-price": 10,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/** 7 days: resolution is coarse enough that both mocked candles survive. */
const WINDOW_MS = 7 * 24 * HOUR_MS;

let renderCount = 0;

function Probe({ rows }: { rows: LocalDatabaseRow[] }): ReactNode {
  renderCount += 1;
  const { data } = useTimeSeriesChartData(
    DATABASE,
    FIELDS,
    rows,
    "f-price",
    WINDOW_MS
  );
  return <div data-testid="points">{data?.series[0]?.points.length ?? -1}</div>;
}

function renderProbe() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const ui = (rows: LocalDatabaseRow[]) => (
    <QueryClientProvider client={client}>
      <Probe rows={rows} />
    </QueryClientProvider>
  );
  const view = render(ui(ROWS));
  return { ...view, ui };
}

/** A price tick: same symbol, new row objects and a new array. */
function tickedRows(price: number): LocalDatabaseRow[] {
  return ROWS.map((row) => ({
    ...row,
    values: { ...row.values, "f-price": price },
  }));
}

afterEach(() => {
  cleanup();
  renderCount = 0;
  historyMocks.series.clear();
  vi.clearAllMocks();
});

describe("useTimeSeriesChartData", () => {
  it("covers gaps via fetchHistory and surfaces the cached points", async () => {
    renderProbe();
    await waitFor(() => {
      expect(screen.getByTestId("points").textContent).toBe("2");
    });
    expect(fetchHistory).toHaveBeenCalled();
    expect(historyMocks.mergeFieldHistory).toHaveBeenCalled();
  });

  it("settles instead of re-rendering forever", async () => {
    renderProbe();
    await waitFor(() => {
      expect(screen.getByTestId("points").textContent).toBe("2");
    });

    const settled = renderCount;
    await new Promise((resolve) => setTimeout(resolve, 250));

    // The live re-read interval is 2s, so a settled hook must not re-render
    // (and must not re-read history) during this idle window.
    expect(renderCount - settled).toBeLessThanOrEqual(1);
    expect(historyMocks.readFieldHistory.mock.calls.length).toBeLessThanOrEqual(
      6
    );
  });

  it("does not reload history when only prices tick", async () => {
    const { rerender, ui } = renderProbe();
    await waitFor(() => {
      expect(screen.getByTestId("points").textContent).toBe("2");
    });

    const readsAfterLoad = historyMocks.readFieldHistory.mock.calls.length;
    const fetchesAfterLoad = fetchHistory.mock.calls.length;
    for (const price of [11, 12, 13]) {
      rerender(ui(tickedRows(price)));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(historyMocks.readFieldHistory.mock.calls.length).toBe(
      readsAfterLoad
    );
    expect(fetchHistory.mock.calls.length).toBe(fetchesAfterLoad);
  });
});
