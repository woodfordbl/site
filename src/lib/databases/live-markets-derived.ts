import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import {
  marketCapFromFloatAndPrice,
  pctChangeFromSeries,
} from "@/lib/databases/series-values.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Live-markets derived metrics: Market cap = Float × Price (always, from row
 * scalars) and Change = rolling 24h pct from the price series once coverage is
 * ensured. Pure overlay — never persisted; merges like formula values.
 */

/** Rolling window for series-derived Change (matches provider 24h semantics). */
export const LIVE_MARKETS_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Field source keys this overlay owns. */
export const LIVE_MARKETS_DERIVED_SOURCE_KEYS = {
  change: "change",
  float: "float",
  marketCap: "marketCap",
  price: "price",
} as const;

export interface LiveMarketsDerivedCell {
  /** Whether Change is still waiting on series coverage. */
  changePending: boolean;
  values: {
    change?: DatabaseCellValue;
    marketCap?: DatabaseCellValue;
  };
}

/** rowId → derived cells. */
export type LiveMarketsDerivedOverlay = Map<string, LiveMarketsDerivedCell>;

function fieldIdForSourceKey(
  fields: readonly DatabaseField[],
  sourceKey: string
): string | undefined {
  return fields.find((field) => field.sourceKey === sourceKey)?.id;
}

/**
 * Build the derived overlay. `seriesByExternalId` is the covered price window
 * (from {@link ensureSeriesCoverage}). Pass `coverageReady: false` while the
 * ensure query is still in flight so Change keeps the seeded provider % until
 * we know whether the series can refine it.
 */
export function computeLiveMarketsDerivedOverlay(
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  seriesByExternalId: ReadonlyMap<string, FieldHistoryPoint[]>,
  nowMs: number = Date.now(),
  options?: { coverageReady?: boolean }
): LiveMarketsDerivedOverlay {
  const overlay: LiveMarketsDerivedOverlay = new Map();
  const coverageReady = options?.coverageReady ?? true;
  const priceId = fieldIdForSourceKey(
    fields,
    LIVE_MARKETS_DERIVED_SOURCE_KEYS.price
  );
  const floatId = fieldIdForSourceKey(
    fields,
    LIVE_MARKETS_DERIVED_SOURCE_KEYS.float
  );
  const changeId = fieldIdForSourceKey(
    fields,
    LIVE_MARKETS_DERIVED_SOURCE_KEYS.change
  );
  const marketCapId = fieldIdForSourceKey(
    fields,
    LIVE_MARKETS_DERIVED_SOURCE_KEYS.marketCap
  );
  if (!(priceId && (floatId || changeId || marketCapId))) {
    return overlay;
  }

  for (const row of rows) {
    const priceRaw = row.values[priceId];
    const price = typeof priceRaw === "number" ? priceRaw : null;
    const floatRaw = floatId ? row.values[floatId] : undefined;
    const floatShares = typeof floatRaw === "number" ? floatRaw : null;

    const values: LiveMarketsDerivedCell["values"] = {};
    let changePending = false;

    if (marketCapId) {
      const derived = marketCapFromFloatAndPrice(floatShares, price);
      if (derived !== null) {
        values.marketCap = derived;
      }
    }

    if (changeId && row.externalId && coverageReady) {
      const series = seriesByExternalId.get(row.externalId) ?? [];
      const change = pctChangeFromSeries(
        series,
        LIVE_MARKETS_CHANGE_WINDOW_MS,
        nowMs,
        price
      );
      if (change !== null) {
        values.change = change;
      } else if (series.length === 0) {
        // Coverage finished but empty — mark pending so the merge can clear a
        // misleading stale value rather than showing a wrong 0%.
        changePending = true;
      }
      // else: series present but valueAt failed (thin history) — leave the
      // seeded provider % in place.
    }

    if (Object.keys(values).length > 0 || changePending) {
      overlay.set(row.id, { changePending, values });
    }
  }
  return overlay;
}

/**
 * Merge derived Change / Market cap into row copies (same pattern as
 * {@link withFormulaValues}). Field ids resolved from `sourceKey`.
 */
export function withLiveMarketsDerivedValues(
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  overlay: LiveMarketsDerivedOverlay
): LocalDatabaseRow[] {
  if (overlay.size === 0) {
    return [...rows];
  }
  const changeId = fieldIdForSourceKey(
    fields,
    LIVE_MARKETS_DERIVED_SOURCE_KEYS.change
  );
  const marketCapId = fieldIdForSourceKey(
    fields,
    LIVE_MARKETS_DERIVED_SOURCE_KEYS.marketCap
  );
  return rows.map((row) => {
    const entry = overlay.get(row.id);
    if (!entry) {
      return row;
    }
    const values = { ...row.values };
    if (marketCapId && entry.values.marketCap !== undefined) {
      values[marketCapId] = entry.values.marketCap;
    }
    if (changeId) {
      if (entry.values.change !== undefined) {
        values[changeId] = entry.values.change;
      } else if (entry.changePending) {
        // Empty while covering — avoid showing a stale provider % as if it
        // were series-derived, and avoid a wrong 0%.
        values[changeId] = null;
      }
    }
    return { ...row, values };
  });
}
