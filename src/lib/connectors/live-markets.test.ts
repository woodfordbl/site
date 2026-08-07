import { describe, expect, it, vi } from "vitest";

import {
  ASSET_CLASS_CRYPTO,
  ASSET_CLASS_EQUITY,
  liveMarketsConnector,
} from "@/lib/connectors/live-markets.ts";
import { ConnectorError } from "@/lib/connectors/types.ts";
import {
  connectorRowsHaveMixedAssetClasses,
  liveMarketsAutoGroupPatch,
} from "@/lib/databases/live-markets-auto-group.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

const coingeckoFixture = [
  {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    current_price: 55_034,
    circulating_supply: 19_800_000,
    market_cap: 1_103_037_933_465,
    price_change_percentage_24h: 2.5,
    last_updated: "2026-07-03T18:20:15.000Z",
  },
];

const finnhubProxyFixture = [
  {
    symbol: "AAPL",
    c: 190.5,
    dp: 1.5,
    t: Date.parse("2026-07-03T18:20:10.000Z") / 1000,
    name: "Apple Inc",
    marketCap: 3_000_000_000_000,
    float: 15_000_000_000,
  },
];

const binanceKlinesFixture = [
  [1_750_000_000_000, "0", "0", "0", "67000.5", "0"],
  [1_750_000_060_000, "0", "0", "0", "67010.25", "0"],
];

const yahooPointsFixture = [
  { t: 1_750_000_000_000, v: 190.1 },
  { t: 1_750_000_060_000, v: 190.5 },
];

const mixedInstruments = [
  { symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO },
  { symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY },
] as const;

function createFetchStub(
  handler: (url: string) => Response | Promise<Response>
) {
  const calls: string[] = [];
  const fetchFn: typeof fetch = (input) => {
    const url = String(input);
    calls.push(url);
    return Promise.resolve(handler(url));
  };
  return { calls, fetchFn };
}

async function expectConnectorError(
  promise: Promise<unknown>
): Promise<ConnectorError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ConnectorError) {
      return error;
    }
    throw new Error(`Expected ConnectorError, got: ${String(error)}`);
  }
  throw new Error("Expected the call to throw");
}

describe("liveMarketsConnector config + fields", () => {
  it("defaults the display currency to USD and ignores legacy type/symbols", () => {
    const parsed = liveMarketsConnector.configSchema.parse({
      type: "crypto",
      symbols: ["BTC"],
      instruments: [{ symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO }],
    });
    expect(parsed).toEqual({
      instruments: [{ symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO }],
      currency: "USD",
    });
    expect("type" in parsed).toBe(false);
    expect("symbols" in parsed).toBe(false);
  });

  it("exposes a fixed mixed-asset schema including assetClass", () => {
    const keys = liveMarketsConnector
      .fields({
        instruments: [...mixedInstruments],
        currency: "USD",
      })
      .map((field) => field.sourceKey);
    expect(keys).toEqual([
      "symbol",
      "name",
      "assetClass",
      "price",
      "change",
      "float",
      "marketCap",
      "updatedAt",
    ]);
  });

  it("stamps the config currency onto the price field", () => {
    const price = liveMarketsConnector
      .fields({
        instruments: [{ symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO }],
        currency: "EUR",
      })
      .find((field) => field.sourceKey === "price");
    expect(price?.numberFormat).toBe("currency");
    expect(price?.currencyCode).toBe("EUR");
  });

  it("declares an instrumentList config field instead of a type selector", () => {
    expect(
      liveMarketsConnector.configFields.some((field) => field.key === "type")
    ).toBe(false);
    expect(
      liveMarketsConnector.configFields.find(
        (field) => field.key === "instruments"
      )?.kind
    ).toBe("instrumentList");
  });
});

describe("liveMarketsConnector.fetchRows explicit classification", () => {
  it("routes crypto and equity instruments to their providers", async () => {
    const { calls, fetchFn } = createFetchStub((url) => {
      if (url.includes("api.coingecko.com")) {
        return new Response(JSON.stringify(coingeckoFixture), { status: 200 });
      }
      if (url.includes("/api/connectors/finnhub/quote")) {
        return new Response(JSON.stringify(finnhubProxyFixture), {
          status: 200,
        });
      }
      return new Response("unexpected", { status: 500 });
    });
    const result = await liveMarketsConnector.fetchRows({
      config: { instruments: [...mixedInstruments], currency: "USD" },
      fetchFn,
    });
    expect(calls.some((url) => url.includes("api.coingecko.com"))).toBe(true);
    expect(
      calls.some((url) => url.includes("/api/connectors/finnhub/quote"))
    ).toBe(true);
    expect(result).toEqual({
      kind: "rows",
      rows: [
        {
          externalId: "BTC",
          values: {
            symbol: "BTC",
            name: "Bitcoin",
            assetClass: ASSET_CLASS_CRYPTO,
            price: 55_034,
            float: 19_800_000,
            change: 0.025,
            marketCap: 19_800_000 * 55_034,
            updatedAt: "2026-07-03T18:20:15.000Z",
          },
        },
        {
          externalId: "AAPL",
          values: {
            symbol: "AAPL",
            name: "Apple Inc",
            assetClass: ASSET_CLASS_EQUITY,
            price: 190.5,
            float: 15_000_000_000,
            change: 0.015,
            marketCap: 15_000_000_000 * 190.5,
            updatedAt: "2026-07-03T18:20:10.000Z",
          },
        },
      ],
    });
  });

  it("skips Finnhub when every instrument is crypto", async () => {
    const { calls, fetchFn } = createFetchStub((url) => {
      if (url.includes("api.coingecko.com")) {
        return new Response(JSON.stringify(coingeckoFixture), { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    });
    const result = await liveMarketsConnector.fetchRows({
      config: {
        instruments: [{ symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO }],
        currency: "EUR",
      },
      fetchFn,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("vs_currency=eur");
    expect(result.kind).toBe("rows");
    if (result.kind === "rows") {
      expect(result.rows[0]?.values.assetClass).toBe(ASSET_CLASS_CRYPTO);
    }
  });

  it("skips CoinGecko when every instrument is equity", async () => {
    const { calls, fetchFn } = createFetchStub((url) => {
      if (url.includes("/api/connectors/finnhub/quote")) {
        return new Response(JSON.stringify(finnhubProxyFixture), {
          status: 200,
        });
      }
      return new Response("unexpected", { status: 500 });
    });
    const result = await liveMarketsConnector.fetchRows({
      config: {
        instruments: [{ symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY }],
        currency: "USD",
      },
      fetchFn,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/api/connectors/finnhub/quote");
    expect(result.kind).toBe("rows");
    if (result.kind === "rows") {
      expect(result.rows[0]?.values).toMatchObject({
        assetClass: ASSET_CLASS_EQUITY,
        name: "Apple Inc",
        float: 15_000_000_000,
        marketCap: 15_000_000_000 * 190.5,
      });
    }
  });

  it("rejects empty instruments as a config error", async () => {
    const { calls, fetchFn } = createFetchStub(
      () => new Response("", { status: 200 })
    );
    const error = await expectConnectorError(
      liveMarketsConnector.fetchRows({
        config: { instruments: [], currency: "USD" },
        fetchFn,
      })
    );
    expect(error.kind).toBe("config");
    expect(calls).toHaveLength(0);
  });
});

describe("liveMarketsConnector.fetchHistory routing", () => {
  const request = {
    externalId: "BTC",
    from: 1_750_000_000_000,
    to: 1_750_000_120_000,
    resolution: "1m" as const,
  };

  it("backfills crypto from Binance klines", async () => {
    const { calls, fetchFn } = createFetchStub((url) => {
      if (url.includes("/klines")) {
        return new Response(JSON.stringify(binanceKlinesFixture), {
          status: 200,
        });
      }
      return new Response("unexpected", { status: 500 });
    });
    const points = await liveMarketsConnector.fetchHistory?.(
      {
        config: {
          instruments: [{ symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO }],
          currency: "USD",
        },
        fetchFn,
      },
      request
    );
    expect(calls.some((url) => url.includes("/klines"))).toBe(true);
    expect(calls.some((url) => url.includes("symbol=BTCUSDT"))).toBe(true);
    expect(points).toEqual([
      { t: 1_750_000_000_000, v: 67_000.5 },
      { t: 1_750_000_060_000, v: 67_010.25 },
    ]);
  });

  it("backfills equity from the Yahoo chart proxy", async () => {
    const { calls, fetchFn } = createFetchStub((url) => {
      if (url.includes("/api/connectors/yahoo/chart")) {
        return new Response(JSON.stringify(yahooPointsFixture), {
          status: 200,
        });
      }
      return new Response("unexpected", { status: 500 });
    });
    const points = await liveMarketsConnector.fetchHistory?.(
      {
        config: {
          instruments: [{ symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY }],
          currency: "USD",
        },
        fetchFn,
      },
      { ...request, externalId: "AAPL", resolution: "1h" }
    );
    expect(
      calls.some((url) => url.includes("/api/connectors/yahoo/chart"))
    ).toBe(true);
    expect(points).toEqual(yahooPointsFixture);
  });
});

describe("liveMarketsAutoGroupPatch", () => {
  function makeDatabase(overrides: Partial<LocalDatabase> = {}): LocalDatabase {
    return {
      id: "db-1",
      name: "Markets",
      primaryFieldId: "f-symbol",
      source: {
        kind: "connector",
        connectorId: "live-markets",
        config: {
          instruments: [...mixedInstruments],
          currency: "USD",
        },
      },
      fields: [
        {
          id: "f-symbol",
          name: "Symbol",
          type: "text",
          sourceKey: "symbol",
        },
        {
          id: "f-class",
          name: "Asset class",
          type: "select",
          sourceKey: "assetClass",
          options: [
            { id: ASSET_CLASS_CRYPTO, name: "Crypto" },
            { id: ASSET_CLASS_EQUITY, name: "Equity" },
          ],
        },
      ],
      views: [
        {
          id: "v-table",
          name: "Table",
          type: "table",
          config: {},
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("detects mixed asset classes from connector rows", () => {
    expect(
      connectorRowsHaveMixedAssetClasses([
        {
          externalId: "BTC",
          values: { assetClass: ASSET_CLASS_CRYPTO },
        },
        {
          externalId: "AAPL",
          values: { assetClass: ASSET_CLASS_EQUITY },
        },
      ])
    ).toBe(true);
    expect(
      connectorRowsHaveMixedAssetClasses([
        {
          externalId: "BTC",
          values: { assetClass: ASSET_CLASS_CRYPTO },
        },
      ])
    ).toBe(false);
  });

  it("auto-groups the table view when both classes appear", () => {
    const patch = liveMarketsAutoGroupPatch(makeDatabase(), [
      { externalId: "BTC", values: { assetClass: ASSET_CLASS_CRYPTO } },
      { externalId: "AAPL", values: { assetClass: ASSET_CLASS_EQUITY } },
    ]);
    expect(patch).toEqual({
      viewId: "v-table",
      patch: {
        groupBy: { fieldId: "f-class" },
        config: {
          liveMarketsGrouping: "auto",
          collapsedGroupKeys: undefined,
          hiddenGroupKeys: undefined,
        },
      },
    });
  });

  it("skips when the user opted out", () => {
    const database = makeDatabase({
      views: [
        {
          id: "v-table",
          name: "Table",
          type: "table",
          config: { liveMarketsGrouping: "manual" },
        },
      ],
    });
    expect(
      liveMarketsAutoGroupPatch(database, [
        { externalId: "BTC", values: { assetClass: ASSET_CLASS_CRYPTO } },
        { externalId: "AAPL", values: { assetClass: ASSET_CLASS_EQUITY } },
      ])
    ).toBeNull();
  });

  it("skips when grouping is already set", () => {
    const database = makeDatabase({
      views: [
        {
          id: "v-table",
          name: "Table",
          type: "table",
          groupBy: { fieldId: "f-symbol" },
          config: {},
        },
      ],
    });
    expect(
      liveMarketsAutoGroupPatch(database, [
        { externalId: "BTC", values: { assetClass: ASSET_CLASS_CRYPTO } },
        { externalId: "AAPL", values: { assetClass: ASSET_CLASS_EQUITY } },
      ])
    ).toBeNull();
  });
});

describe("yahooFetchHistory", () => {
  it("requests the proxy with mapped interval", async () => {
    const { yahooFetchHistory: fetchHistory } = await import(
      "@/lib/connectors/yahoo-chart.ts"
    );
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify(yahooPointsFixture), { status: 200 })
    );
    const points = await fetchHistory(
      { config: {}, fetchFn },
      {
        externalId: "AAPL",
        from: 1000,
        to: 2000,
        resolution: "4h",
      }
    );
    expect(fetchFn).toHaveBeenCalledOnce();
    const firstCall = fetchFn.mock.calls[0] as unknown as
      | [RequestInfo | URL]
      | undefined;
    const url = String(firstCall?.[0] ?? "");
    expect(url).toContain("/api/connectors/yahoo/chart");
    expect(url).toContain("symbol=AAPL");
    expect(url).toContain("interval=1h");
    expect(points).toEqual(yahooPointsFixture);
  });
});
