import { describe, expect, it } from "vitest";

import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import {
  computeLiveMarketsDerivedOverlay,
  withLiveMarketsDerivedValues,
} from "@/lib/databases/live-markets-derived.ts";
import type {
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const DAY_MS = 86_400_000;

const FIELDS: DatabaseField[] = [
  { id: "f-price", name: "Price", type: "number", sourceKey: "price" },
  { id: "f-float", name: "Float", type: "number", sourceKey: "float" },
  { id: "f-change", name: "Change", type: "number", sourceKey: "change" },
  {
    id: "f-mcap",
    name: "Market cap",
    type: "number",
    sourceKey: "marketCap",
  },
];

const ROW: LocalDatabaseRow = {
  id: "row-1",
  databaseId: "db-1",
  externalId: "BTC",
  values: {
    "f-price": 110,
    "f-float": 19_000_000,
    "f-change": 0.01,
    "f-mcap": 1,
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("computeLiveMarketsDerivedOverlay", () => {
  it("derives market cap from float × price", () => {
    const overlay = computeLiveMarketsDerivedOverlay(
      FIELDS,
      [ROW],
      new Map(),
      Date.now()
    );
    expect(overlay.get("row-1")?.values.marketCap).toBe(19_000_000 * 110);
  });

  it("derives change from a covered 24h series", () => {
    const now = 1_700_000_000_000;
    const series: FieldHistoryPoint[] = [
      { t: now - DAY_MS, v: 100 },
      { t: now - DAY_MS / 2, v: 105 },
      { t: now, v: 110 },
    ];
    const overlay = computeLiveMarketsDerivedOverlay(
      FIELDS,
      [ROW],
      new Map([["BTC", series]]),
      now
    );
    expect(overlay.get("row-1")?.values.change).toBeCloseTo(0.1);
    expect(overlay.get("row-1")?.changePending).toBe(false);
  });

  it("marks change pending when series is empty", () => {
    const overlay = computeLiveMarketsDerivedOverlay(
      FIELDS,
      [ROW],
      new Map([["BTC", []]]),
      Date.now(),
      { coverageReady: true }
    );
    expect(overlay.get("row-1")?.changePending).toBe(true);
    expect(overlay.get("row-1")?.values.change).toBeUndefined();
  });

  it("leaves change alone while coverage is still loading", () => {
    const overlay = computeLiveMarketsDerivedOverlay(
      FIELDS,
      [ROW],
      new Map(),
      Date.now(),
      { coverageReady: false }
    );
    expect(overlay.get("row-1")?.changePending).toBe(false);
    expect(overlay.get("row-1")?.values.change).toBeUndefined();
    expect(overlay.get("row-1")?.values.marketCap).toBe(19_000_000 * 110);
  });
});

describe("withLiveMarketsDerivedValues", () => {
  it("merges derived values and clears change while pending", () => {
    const overlay = computeLiveMarketsDerivedOverlay(
      FIELDS,
      [ROW],
      new Map(),
      Date.now(),
      { coverageReady: true }
    );
    const merged = withLiveMarketsDerivedValues(FIELDS, [ROW], overlay);
    expect(merged[0].values["f-mcap"]).toBe(19_000_000 * 110);
    expect(merged[0].values["f-change"]).toBeNull();
  });
});
