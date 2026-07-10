import { describe, expect, it } from "vitest";

import { liveMarketsConnector } from "@/lib/connectors/live-markets.ts";
import { ConnectorError } from "@/lib/connectors/types.ts";

const coingeckoFixture = [
  {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    current_price: 55_034,
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
    // Finnhub quote time is unix seconds.
    t: Date.parse("2026-07-03T18:20:10.000Z") / 1000,
  },
];

const binanceKlinesFixture = [
  [1_750_000_000_000, "0", "0", "0", "67000.5", "0"],
  [1_750_000_060_000, "0", "0", "0", "67010.25", "0"],
];

function createFetchStub(response: Response) {
  const calls: string[] = [];
  const fetchFn: typeof fetch = (input) => {
    calls.push(String(input));
    return Promise.resolve(response);
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
  it("defaults the display currency to USD", () => {
    const parsed = liveMarketsConnector.configSchema.parse({
      type: "crypto",
      symbols: ["BTC"],
    });
    expect(parsed.currency).toBe("USD");
  });

  it("gives crypto Name + Market cap columns; stocks a leaner set", () => {
    const cryptoKeys = liveMarketsConnector
      .fields({ type: "crypto", symbols: ["BTC"], currency: "USD" })
      .map((field) => field.sourceKey);
    const stockKeys = liveMarketsConnector
      .fields({ type: "stocks", symbols: ["AAPL"], currency: "USD" })
      .map((field) => field.sourceKey);
    expect(cryptoKeys).toEqual([
      "symbol",
      "name",
      "price",
      "change",
      "marketCap",
      "updatedAt",
    ]);
    expect(stockKeys).toEqual(["symbol", "price", "change", "updatedAt"]);
  });

  it("stamps the config currency onto the price field", () => {
    const price = liveMarketsConnector
      .fields({ type: "crypto", symbols: ["BTC"], currency: "EUR" })
      .find((field) => field.sourceKey === "price");
    expect(price?.numberFormat).toBe("currency");
    expect(price?.currencyCode).toBe("EUR");
  });
});

describe("liveMarketsConnector.fetchRows delegation", () => {
  it("seeds the crypto type from CoinGecko in the chosen currency", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(coingeckoFixture), { status: 200 })
    );
    const result = await liveMarketsConnector.fetchRows({
      config: { type: "crypto", symbols: ["BTC"], currency: "EUR" },
      fetchFn,
    });
    expect(calls[0]).toContain("api.coingecko.com");
    expect(calls[0]).toContain("vs_currency=eur");
    expect(result).toEqual({
      kind: "rows",
      rows: [
        {
          externalId: "BTC",
          values: {
            symbol: "BTC",
            name: "Bitcoin",
            price: 55_034,
            change: 0.025,
            marketCap: 1_103_037_933_465,
            updatedAt: "2026-07-03",
          },
        },
      ],
    });
  });

  it("routes the stocks type to the Finnhub proxy", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(finnhubProxyFixture), { status: 200 })
    );
    const result = await liveMarketsConnector.fetchRows({
      config: { type: "stocks", symbols: ["AAPL"], currency: "USD" },
      fetchFn,
    });
    expect(calls[0]).toContain("/api/connectors/finnhub/quote");
    expect(result).toEqual({
      kind: "rows",
      rows: [
        {
          externalId: "AAPL",
          values: {
            symbol: "AAPL",
            price: 190.5,
            change: 0.015,
            updatedAt: "2026-07-03",
          },
        },
      ],
    });
  });

  it("rejects an unknown type as a config error", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response("", { status: 200 })
    );
    const error = await expectConnectorError(
      liveMarketsConnector.fetchRows({
        config: { type: "commodities", symbols: ["GOLD"] },
        fetchFn,
      })
    );
    expect(error.kind).toBe("config");
    expect(calls).toHaveLength(0);
  });
});

describe("liveMarketsConnector.fetchHistory delegation", () => {
  const request = {
    externalId: "BTC",
    from: 1_750_000_000_000,
    to: 1_750_000_120_000,
    resolution: "1m" as const,
  };

  it("backfills crypto from Binance klines on the currency's pair", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(binanceKlinesFixture), { status: 200 })
    );
    const points = await liveMarketsConnector.fetchHistory?.(
      {
        config: { type: "crypto", symbols: ["BTC"], currency: "USD" },
        fetchFn,
      },
      request
    );
    expect(calls[0]).toContain("/klines");
    expect(calls[0]).toContain("symbol=BTCUSDT");
    expect(points).toEqual([
      { t: 1_750_000_000_000, v: 67_000.5 },
      { t: 1_750_000_060_000, v: 67_010.25 },
    ]);
  });

  it("returns no backfill for stocks without hitting the network", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response("", { status: 200 })
    );
    const points = await liveMarketsConnector.fetchHistory?.(
      {
        config: { type: "stocks", symbols: ["AAPL"], currency: "USD" },
        fetchFn,
      },
      request
    );
    expect(points).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
