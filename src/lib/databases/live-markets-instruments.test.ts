import { describe, expect, it } from "vitest";

import {
  ASSET_CLASS_CRYPTO,
  ASSET_CLASS_EQUITY,
  MAX_LIVE_MARKET_INSTRUMENTS,
} from "@/lib/connectors/live-markets.ts";
import {
  isLiveMarketIdentityField,
  isLiveMarketsDatabase,
  normalizeLiveMarketSymbol,
  planLiveMarketIdentityCommit,
  planLiveMarketRowDelete,
} from "@/lib/databases/live-markets-instruments.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

function makeRow(
  overrides?: Partial<LocalDatabaseRow> & {
    values?: LocalDatabaseRow["values"];
  }
): LocalDatabaseRow {
  return {
    id: "row-1",
    databaseId: "db-1",
    values: overrides?.values ?? {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isLiveMarketsDatabase", () => {
  it("matches only the live-markets connector", () => {
    expect(
      isLiveMarketsDatabase({
        source: { kind: "connector", connectorId: "live-markets", config: {} },
      })
    ).toBe(true);
    expect(
      isLiveMarketsDatabase({
        source: {
          kind: "connector",
          connectorId: "frankfurter-rates",
          config: {},
        },
      })
    ).toBe(false);
    expect(isLiveMarketsDatabase({} as Pick<LocalDatabase, "source">)).toBe(
      false
    );
  });
});

describe("isLiveMarketIdentityField", () => {
  it("matches symbol and assetClass source keys only", () => {
    expect(isLiveMarketIdentityField({ sourceKey: "symbol" })).toBe(true);
    expect(isLiveMarketIdentityField({ sourceKey: "assetClass" })).toBe(true);
    expect(isLiveMarketIdentityField({ sourceKey: "price" })).toBe(false);
    expect(isLiveMarketIdentityField({})).toBe(false);
  });
});

describe("normalizeLiveMarketSymbol", () => {
  it("uppercases and rejects invalid tickers", () => {
    expect(normalizeLiveMarketSymbol(" aapl ")).toBe("AAPL");
    expect(normalizeLiveMarketSymbol("")).toBeNull();
    expect(normalizeLiveMarketSymbol("!!!")).toBeNull();
  });
});

describe("planLiveMarketIdentityCommit", () => {
  const symbolFieldId = "f-symbol";
  const assetClassFieldId = "f-class";

  it("appends a pending row symbol to the watchlist", () => {
    const result = planLiveMarketIdentityCommit({
      assetClassFieldId,
      instruments: [{ symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO }],
      row: makeRow({ values: { [assetClassFieldId]: ASSET_CLASS_EQUITY } }),
      symbolFieldId,
      symbolPatch: "aapl",
    });
    expect(result).toEqual({
      ok: true,
      plan: {
        assetClass: ASSET_CLASS_EQUITY,
        instruments: [
          { symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO },
          { symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY },
        ],
        instrumentsChanged: true,
        nextExternalId: "AAPL",
        symbol: "AAPL",
      },
    });
  });

  it("renames a committed symbol in place", () => {
    const result = planLiveMarketIdentityCommit({
      assetClassFieldId,
      instruments: [{ symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY }],
      row: makeRow({
        externalId: "AAPL",
        values: {
          [symbolFieldId]: "AAPL",
          [assetClassFieldId]: ASSET_CLASS_EQUITY,
        },
      }),
      symbolFieldId,
      symbolPatch: "MSFT",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.nextExternalId).toBe("MSFT");
    expect(result.plan.instruments).toEqual([
      { symbol: "MSFT", assetClass: ASSET_CLASS_EQUITY },
    ]);
  });

  it("updates asset class without changing externalId", () => {
    const result = planLiveMarketIdentityCommit({
      assetClassFieldId,
      assetClassPatch: ASSET_CLASS_CRYPTO,
      instruments: [{ symbol: "BTC", assetClass: ASSET_CLASS_EQUITY }],
      row: makeRow({
        externalId: "BTC",
        values: {
          [symbolFieldId]: "BTC",
          [assetClassFieldId]: ASSET_CLASS_EQUITY,
        },
      }),
      symbolFieldId,
    });
    expect(result).toEqual({
      ok: true,
      plan: {
        assetClass: ASSET_CLASS_CRYPTO,
        instruments: [{ symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO }],
        instrumentsChanged: true,
        nextExternalId: "BTC",
        symbol: "BTC",
      },
    });
  });

  it("rejects invalid and duplicate symbols", () => {
    expect(
      planLiveMarketIdentityCommit({
        assetClassFieldId,
        instruments: [],
        row: makeRow(),
        symbolFieldId,
        symbolPatch: "!!!",
      })
    ).toEqual({ ok: false, reason: "invalid-symbol" });

    expect(
      planLiveMarketIdentityCommit({
        assetClassFieldId,
        instruments: [{ symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY }],
        row: makeRow({ values: { [assetClassFieldId]: ASSET_CLASS_EQUITY } }),
        symbolFieldId,
        symbolPatch: "AAPL",
      })
    ).toEqual({ ok: false, reason: "duplicate-symbol" });
  });

  it("rejects appends at capacity", () => {
    const instruments: {
      symbol: string;
      assetClass: typeof ASSET_CLASS_EQUITY;
    }[] = Array.from({ length: MAX_LIVE_MARKET_INSTRUMENTS }, (_, index) => ({
      symbol: `S${index}`,
      assetClass: ASSET_CLASS_EQUITY,
    }));
    expect(
      planLiveMarketIdentityCommit({
        assetClassFieldId,
        instruments,
        row: makeRow({ values: { [assetClassFieldId]: ASSET_CLASS_EQUITY } }),
        symbolFieldId,
        symbolPatch: "ZZZZ",
      })
    ).toEqual({ ok: false, reason: "at-capacity" });
  });

  it("rejects clearing the last committed symbol", () => {
    expect(
      planLiveMarketIdentityCommit({
        assetClassFieldId,
        instruments: [{ symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY }],
        row: makeRow({
          externalId: "AAPL",
          values: {
            [symbolFieldId]: "AAPL",
            [assetClassFieldId]: ASSET_CLASS_EQUITY,
          },
        }),
        symbolFieldId,
        symbolPatch: null,
      })
    ).toEqual({ ok: false, reason: "keep-at-least-one" });
  });

  it("leaves instruments unchanged when only seeding asset class on a pending row", () => {
    const result = planLiveMarketIdentityCommit({
      assetClassFieldId,
      assetClassPatch: ASSET_CLASS_CRYPTO,
      instruments: [{ symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY }],
      row: makeRow({ values: { [assetClassFieldId]: ASSET_CLASS_EQUITY } }),
      symbolFieldId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.instrumentsChanged).toBe(false);
    expect(result.plan.nextExternalId).toBeUndefined();
    expect(result.plan.assetClass).toBe(ASSET_CLASS_CRYPTO);
  });
});

describe("planLiveMarketRowDelete", () => {
  const symbolFieldId = "f-symbol";

  it("removes matching instruments and keeps others", () => {
    const result = planLiveMarketRowDelete({
      instruments: [
        { symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY },
        { symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO },
      ],
      rows: [
        makeRow({
          id: "row-aapl",
          externalId: "AAPL",
          values: { [symbolFieldId]: "AAPL" },
        }),
      ],
      symbolFieldId,
    });
    expect(result).toEqual({
      ok: true,
      instruments: [{ symbol: "BTC", assetClass: ASSET_CLASS_CRYPTO }],
      instrumentsChanged: true,
      rowIds: ["row-aapl"],
    });
  });

  it("allows deleting pending rows without touching instruments", () => {
    const result = planLiveMarketRowDelete({
      instruments: [{ symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY }],
      rows: [makeRow({ id: "row-pending" })],
      symbolFieldId,
    });
    expect(result).toEqual({
      ok: true,
      instruments: [{ symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY }],
      instrumentsChanged: false,
      rowIds: ["row-pending"],
    });
  });

  it("rejects deleting the last instrument", () => {
    expect(
      planLiveMarketRowDelete({
        instruments: [{ symbol: "AAPL", assetClass: ASSET_CLASS_EQUITY }],
        rows: [
          makeRow({
            id: "row-aapl",
            externalId: "AAPL",
            values: { [symbolFieldId]: "AAPL" },
          }),
        ],
        symbolFieldId,
      })
    ).toEqual({ ok: false, reason: "keep-at-least-one" });
  });
});
