import { describe, expect, it } from "vitest";

import { finnhubFetchRows } from "@/lib/connectors/finnhub-quotes.ts";

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

describe("finnhubFetchRows enrichment", () => {
  it("maps proxy name + absolute marketCap onto equity seed rows", async () => {
    const { fetchFn } = createFetchStub((url) => {
      if (url.includes("/api/connectors/finnhub/quote")) {
        return new Response(
          JSON.stringify([
            {
              symbol: "MSFT",
              c: 420.1,
              dp: -0.5,
              t: Date.parse("2026-07-03T18:20:10.000Z") / 1000,
              name: "Microsoft Corp",
              marketCap: 3_100_000_000_000,
            },
          ]),
          { status: 200 }
        );
      }
      return new Response("unexpected", { status: 500 });
    });

    const result = await finnhubFetchRows({
      config: { symbols: ["MSFT"] },
      fetchFn,
    });

    expect(result).toEqual({
      kind: "rows",
      rows: [
        {
          externalId: "MSFT",
          values: {
            symbol: "MSFT",
            name: "Microsoft Corp",
            float: null,
            marketCap: 3_100_000_000_000,
            price: 420.1,
            change: -0.005,
            updatedAt: "2026-07-03T18:20:10.000Z",
          },
        },
      ],
    });
  });

  it("scales Finnhub profile millions to absolute units in direct mode", async () => {
    const { calls, fetchFn } = createFetchStub((url) => {
      if (url.includes("/api/v1/quote")) {
        return new Response(
          JSON.stringify({
            c: 190.5,
            dp: 1.5,
            t: Date.parse("2026-07-03T18:20:10.000Z") / 1000,
          }),
          { status: 200 }
        );
      }
      if (url.includes("/api/v1/stock/profile2")) {
        return new Response(
          JSON.stringify({
            name: "Apple Inc",
            marketCapitalization: 3_000_000,
            shareOutstanding: 15_000,
          }),
          { status: 200 }
        );
      }
      return new Response("unexpected", { status: 500 });
    });

    const result = await finnhubFetchRows({
      config: { symbols: ["AAPL"] },
      token: "test-token",
      fetchFn,
    });

    expect(calls.some((url) => url.includes("/quote"))).toBe(true);
    expect(calls.some((url) => url.includes("/stock/profile2"))).toBe(true);
    expect(result).toEqual({
      kind: "rows",
      rows: [
        {
          externalId: "AAPL",
          values: {
            symbol: "AAPL",
            name: "Apple Inc",
            float: 15_000_000_000,
            marketCap: 15_000_000_000 * 190.5,
            price: 190.5,
            change: 0.015,
            updatedAt: "2026-07-03T18:20:10.000Z",
          },
        },
      ],
    });
  });

  it("keeps quote rows when profile enrichment fails", async () => {
    const { fetchFn } = createFetchStub((url) => {
      if (url.includes("/api/v1/quote")) {
        return new Response(
          JSON.stringify({
            c: 10,
            dp: null,
            t: Date.parse("2026-07-03T18:20:10.000Z") / 1000,
          }),
          { status: 200 }
        );
      }
      if (url.includes("/api/v1/stock/profile2")) {
        return new Response("nope", { status: 500 });
      }
      return new Response("unexpected", { status: 500 });
    });

    const result = await finnhubFetchRows({
      config: { symbols: ["XYZ"] },
      token: "test-token",
      fetchFn,
    });

    expect(result).toEqual({
      kind: "rows",
      rows: [
        {
          externalId: "XYZ",
          values: {
            symbol: "XYZ",
            name: null,
            float: null,
            marketCap: null,
            price: 10,
            change: null,
            updatedAt: "2026-07-03T18:20:10.000Z",
          },
        },
      ],
    });
  });
});
