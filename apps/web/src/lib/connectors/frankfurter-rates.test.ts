import { describe, expect, it } from "vitest";

import { frankfurterRatesConnector } from "@/lib/connectors/frankfurter-rates.ts";
import { ConnectorError } from "@/lib/connectors/types.ts";

const latestFixture = {
  amount: 1,
  base: "USD",
  date: "2026-07-03",
  rates: {
    EUR: 0.923_41,
    GBP: 0.789_12,
    JPY: 159.42,
  },
};

function createFetchStub(response: Response) {
  const calls: { url: string }[] = [];
  const fetchFn: typeof fetch = (input) => {
    calls.push({ url: String(input) });
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

describe("frankfurterRatesConnector.fetchRows", () => {
  it("builds the latest-rates URL with an uppercased base", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(latestFixture), { status: 200 })
    );
    await frankfurterRatesConnector.fetchRows({
      config: { base: "usd" },
      fetchFn,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.frankfurter.dev/v1/latest?base=USD");
  });

  it("defaults the base to USD when absent from config", async () => {
    const { calls, fetchFn } = createFetchStub(
      new Response(JSON.stringify(latestFixture), { status: 200 })
    );
    await frankfurterRatesConnector.fetchRows({ config: {}, fetchFn });
    expect(calls[0].url).toBe("https://api.frankfurter.dev/v1/latest?base=USD");
  });

  it("maps one row per quote currency with the publication date", async () => {
    const { fetchFn } = createFetchStub(
      new Response(JSON.stringify(latestFixture), { status: 200 })
    );
    const result = await frankfurterRatesConnector.fetchRows({
      config: { base: "USD" },
      fetchFn,
    });
    expect(result).toEqual({
      kind: "rows",
      rows: [
        {
          externalId: "EUR",
          values: { currency: "EUR", rate: 0.923_41, asOf: "2026-07-03" },
        },
        {
          externalId: "GBP",
          values: { currency: "GBP", rate: 0.789_12, asOf: "2026-07-03" },
        },
        {
          externalId: "JPY",
          values: { currency: "JPY", rate: 159.42, asOf: "2026-07-03" },
        },
      ],
    });
  });

  it("maps 404 (unknown base) to a config error", async () => {
    const { fetchFn } = createFetchStub(
      new Response("not found", { status: 404 })
    );
    const error = await expectConnectorError(
      frankfurterRatesConnector.fetchRows({
        config: { base: "ZZZ" },
        fetchFn,
      })
    );
    expect(error.kind).toBe("config");
  });

  it("maps other failures to network errors", async () => {
    const { fetchFn } = createFetchStub(new Response("oops", { status: 503 }));
    const error = await expectConnectorError(
      frankfurterRatesConnector.fetchRows({
        config: { base: "USD" },
        fetchFn,
      })
    );
    expect(error.kind).toBe("network");
  });
});
