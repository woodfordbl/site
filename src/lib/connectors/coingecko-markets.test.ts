import { describe, expect, it } from "vitest";

import { coingeckoCryptoFetchRows } from "@/lib/connectors/coingecko-markets.ts";
import { ConnectorError } from "@/lib/connectors/types.ts";
import { formatCellValue } from "@/lib/databases/cell-values.ts";

const marketsFixture = [
  {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    current_price: 55_034,
    market_cap: 1_103_037_933_465,
    price_change_percentage_24h: 2.5,
    last_updated: "2026-07-03T18:20:15.123Z",
  },
  {
    id: "ethereum",
    symbol: "eth",
    name: "Ethereum",
    current_price: 2810.9,
    market_cap: 338_000_000_000,
    price_change_percentage_24h: -1.25,
    last_updated: "2026-07-03T18:20:10.456Z",
  },
];

function createFetchStub(response: Response) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
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
  throw new Error("Expected fetchRows to throw");
}

describe("coingeckoCryptoFetchRows", () => {
  it("resolves tickers via the symbols param and honors the currency", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(marketsFixture), { status: 200 })
    );
    await coingeckoCryptoFetchRows({
      config: { symbols: ["BTC", "ETH"], currency: "EUR" },
      fetchFn,
    });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.coingecko.com/api/v3/coins/markets"
    );
    expect(url.searchParams.get("vs_currency")).toBe("eur");
    expect(url.searchParams.get("symbols")).toBe("btc,eth");
  });

  it("keys rows by the base ticker with market cap and fractional change", async () => {
    const { fetchFn } = createFetchStub(
      new Response(JSON.stringify(marketsFixture), { status: 200 })
    );
    const result = await coingeckoCryptoFetchRows({
      config: { symbols: ["BTC", "ETH"], currency: "EUR" },
      fetchFn,
    });
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
        {
          externalId: "ETH",
          values: {
            symbol: "ETH",
            name: "Ethereum",
            price: 2810.9,
            change: -0.0125,
            marketCap: 338_000_000_000,
            updatedAt: "2026-07-03",
          },
        },
      ],
    });
  });

  it("de-dupes when a ticker resolves to multiple coins (keeps the first)", async () => {
    const { fetchFn } = createFetchStub(
      new Response(
        JSON.stringify([
          marketsFixture[0],
          { ...marketsFixture[0], id: "bitcoin-imposter", name: "Not Bitcoin" },
        ]),
        { status: 200 }
      )
    );
    const result = await coingeckoCryptoFetchRows({
      config: { symbols: ["BTC"], currency: "USD" },
      fetchFn,
    });
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

  it("stores fractions that render with percent format semantics", () => {
    expect(
      formatCellValue(
        { id: "f", name: "24h change", type: "number", format: "percent" },
        0.025
      )
    ).toBe("2.5%");
  });

  it("maps 429 to a rateLimit error", async () => {
    const { fetchFn } = createFetchStub(
      new Response("throttled", {
        status: 429,
        headers: { "retry-after": "30" },
      })
    );
    const error = await expectConnectorError(
      coingeckoCryptoFetchRows({
        config: { symbols: ["BTC"], currency: "USD" },
        fetchFn,
      })
    );
    expect(error.kind).toBe("rateLimit");
    expect(error.retryAfterMs).toBe(30_000);
  });

  it("rejects an empty ticker list as a config error", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(marketsFixture), { status: 200 })
    );
    const error = await expectConnectorError(
      coingeckoCryptoFetchRows({ config: { symbols: [] }, fetchFn })
    );
    expect(error.kind).toBe("config");
    expect(calls).toHaveLength(0);
  });
});
