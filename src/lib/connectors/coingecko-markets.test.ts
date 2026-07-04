import { describe, expect, it } from "vitest";

import { coingeckoMarketsConnector } from "@/lib/connectors/coingecko-markets.ts";
import { ConnectorError } from "@/lib/connectors/types.ts";
import { formatCellValue } from "@/lib/databases/cell-values.ts";

const marketsFixture = [
  {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
    current_price: 67_123.45,
    market_cap: 1_320_456_789_012,
    market_cap_rank: 1,
    price_change_percentage_24h: 2.5,
    last_updated: "2026-07-03T18:20:15.123Z",
  },
  {
    id: "ethereum",
    symbol: "eth",
    name: "Ethereum",
    image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
    current_price: 3210.9,
    market_cap: 385_000_000_000,
    market_cap_rank: 2,
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

describe("coingeckoMarketsConnector.fetchRows", () => {
  it("builds the markets URL with usd vs_currency and joined coin ids", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(marketsFixture), { status: 200 })
    );
    await coingeckoMarketsConnector.fetchRows({
      config: { coinIds: ["bitcoin", "ethereum"] },
      fetchFn,
    });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.coingecko.com/api/v3/coins/markets"
    );
    expect(url.searchParams.get("vs_currency")).toBe("usd");
    expect(url.searchParams.get("ids")).toBe("bitcoin,ethereum");
  });

  it("does not send conditional headers even when an etag is in context", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(marketsFixture), { status: 200 })
    );
    await coingeckoMarketsConnector.fetchRows({
      config: { coinIds: ["bitcoin"] },
      etag: 'W/"stale"',
      fetchFn,
    });
    expect(calls[0].headers.has("if-none-match")).toBe(false);
  });

  it("maps coins to rows, storing 24h change as a fraction", async () => {
    const { fetchFn } = createFetchStub(
      new Response(JSON.stringify(marketsFixture), { status: 200 })
    );
    const result = await coingeckoMarketsConnector.fetchRows({
      config: { coinIds: ["bitcoin", "ethereum"] },
      fetchFn,
    });
    expect(result).toEqual({
      kind: "rows",
      rows: [
        {
          externalId: "bitcoin",
          values: {
            name: "Bitcoin",
            symbol: "BTC",
            price: 67_123.45,
            change24h: 0.025,
            marketCap: 1_320_456_789_012,
            updatedAt: "2026-07-03",
          },
        },
        {
          externalId: "ethereum",
          values: {
            name: "Ethereum",
            symbol: "ETH",
            price: 3210.9,
            change24h: -0.0125,
            marketCap: 385_000_000_000,
            updatedAt: "2026-07-03",
          },
        },
      ],
    });
  });

  it("stores fractions that render with percent format semantics", () => {
    // CoinGecko's 2.5 (= 2.5%) must display as "2.5%", so the stored value
    // has to be the Intl fraction 0.025 — cross-check with formatCellValue.
    expect(
      formatCellValue(
        { id: "f", name: "24h change", type: "number", format: "percent" },
        0.025
      )
    ).toBe("2.5%");
  });

  it("maps 429 to a rateLimit error with Retry-After", async () => {
    const { fetchFn } = createFetchStub(
      new Response("throttled", {
        status: 429,
        headers: { "retry-after": "30" },
      })
    );
    const error = await expectConnectorError(
      coingeckoMarketsConnector.fetchRows({
        config: { coinIds: ["bitcoin"] },
        fetchFn,
      })
    );
    expect(error.kind).toBe("rateLimit");
    expect(error.retryAfterMs).toBe(30_000);
  });

  it("maps other failures to network errors", async () => {
    const { fetchFn } = createFetchStub(new Response("oops", { status: 500 }));
    const error = await expectConnectorError(
      coingeckoMarketsConnector.fetchRows({
        config: { coinIds: ["bitcoin"] },
        fetchFn,
      })
    );
    expect(error.kind).toBe("network");
  });

  it("rejects an empty coin list as a config error", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(marketsFixture), { status: 200 })
    );
    const error = await expectConnectorError(
      coingeckoMarketsConnector.fetchRows({ config: { coinIds: [] }, fetchFn })
    );
    expect(error.kind).toBe("config");
    expect(calls).toHaveLength(0);
  });
});
