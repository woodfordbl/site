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

interface DerivedFieldIds {
  changeId: string | undefined;
  floatId: string | undefined;
  marketCapId: string | undefined;
  priceId: string;
}

function resolveDerivedFieldIds(
  fields: readonly DatabaseField[]
): DerivedFieldIds | null {
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
    return null;
  }
  return { changeId, floatId, marketCapId, priceId };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function deriveChangeForRow(
  series: readonly FieldHistoryPoint[],
  nowMs: number,
  price: number | null
): { change?: number; changePending: boolean } {
  const change = pctChangeFromSeries(
    series,
    LIVE_MARKETS_CHANGE_WINDOW_MS,
    nowMs,
    price
  );
  if (change !== null) {
    return { change, changePending: false };
  }
  // Coverage finished but empty — mark pending so the merge can clear a
  // misleading stale value rather than showing a wrong 0%. Series present but
  // valueAt failed (thin history) leaves the seeded provider % in place.
  return { changePending: series.length === 0 };
}

function computeDerivedCellForRow(
  row: LocalDatabaseRow,
  fieldIds: DerivedFieldIds,
  seriesByExternalId: ReadonlyMap<string, FieldHistoryPoint[]>,
  nowMs: number,
  coverageReady: boolean
): LiveMarketsDerivedCell | null {
  const price = asFiniteNumber(row.values[fieldIds.priceId]);
  const floatShares = fieldIds.floatId
    ? asFiniteNumber(row.values[fieldIds.floatId])
    : null;

  const values: LiveMarketsDerivedCell["values"] = {};
  let changePending = false;

  if (fieldIds.marketCapId) {
    const derived = marketCapFromFloatAndPrice(floatShares, price);
    if (derived !== null) {
      values.marketCap = derived;
    }
  }

  if (fieldIds.changeId && row.externalId && coverageReady) {
    const derivedChange = deriveChangeForRow(
      seriesByExternalId.get(row.externalId) ?? [],
      nowMs,
      price
    );
    if (derivedChange.change !== undefined) {
      values.change = derivedChange.change;
    }
    changePending = derivedChange.changePending;
  }

  if (Object.keys(values).length === 0 && !changePending) {
    return null;
  }
  return { changePending, values };
}

/**
 * Build the derived overlay. `seriesByExternalId` is the covered price window
 * (from {@link ensureSeriesCoverageMany}). Pass `coverageReady: false` while the
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
  const fieldIds = resolveDerivedFieldIds(fields);
  if (!fieldIds) {
    return overlay;
  }
  const coverageReady = options?.coverageReady ?? true;

  for (const row of rows) {
    const cell = computeDerivedCellForRow(
      row,
      fieldIds,
      seriesByExternalId,
      nowMs,
      coverageReady
    );
    if (cell) {
      overlay.set(row.id, cell);
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
