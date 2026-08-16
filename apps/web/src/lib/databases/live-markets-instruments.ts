import {
  ASSET_CLASS_EQUITY,
  LIVE_MARKET_SYMBOL_PATTERN,
  type LiveAssetClass,
  type LiveInstrument,
  MAX_LIVE_MARKET_INSTRUMENTS,
  parseLiveInstruments,
} from "@/lib/connectors/live-markets.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Pure helpers for Stocks/Crypto (`live-markets`) watchlist identity: Symbol
 * and Asset class map 1:1 onto `source.config.instruments`. Grid New row /
 * cell edits / delete go through these planners so the sync engine sees a
 * real instrument-list change and refetches derived fields.
 */

export const LIVE_MARKET_SYMBOL_SOURCE_KEY = "symbol";
export const LIVE_MARKET_ASSET_CLASS_SOURCE_KEY = "assetClass";

/** True when the database is the Stocks and Crypto connector. */
export function isLiveMarketsDatabase(
  database: Pick<LocalDatabase, "source">
): boolean {
  return (
    database.source?.kind === "connector" &&
    database.source.connectorId === "live-markets"
  );
}

/** Symbol / Asset class — the only synced fields editable on live-markets. */
export function isLiveMarketIdentityField(
  field: Pick<DatabaseField, "sourceKey">
): boolean {
  return (
    field.sourceKey === LIVE_MARKET_SYMBOL_SOURCE_KEY ||
    field.sourceKey === LIVE_MARKET_ASSET_CLASS_SOURCE_KEY
  );
}

/** Trim + uppercase; null when empty or outside the ticker pattern. */
export function normalizeLiveMarketSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase();
  if (symbol.length === 0) {
    return null;
  }
  return LIVE_MARKET_SYMBOL_PATTERN.test(symbol) ? symbol : null;
}

/** Read the configured instrument list from a connector database's source. */
export function readLiveMarketInstruments(
  database: LocalDatabase
): LiveInstrument[] {
  if (database.source?.kind !== "connector") {
    return [];
  }
  return parseLiveInstruments(database.source.config.instruments);
}

/** Field id for a connector `sourceKey`, if present. */
export function liveMarketFieldId(
  database: LocalDatabase,
  sourceKey: string
): string | undefined {
  return database.fields.find((field) => field.sourceKey === sourceKey)?.id;
}

/** Resolve the row's current symbol from values or `externalId`. */
export function resolveLiveMarketRowSymbol(
  row: LocalDatabaseRow,
  symbolFieldId: string | undefined
): string | undefined {
  if (symbolFieldId !== undefined) {
    const value = row.values[symbolFieldId];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim().toUpperCase();
    }
  }
  return row.externalId;
}

/** Resolve Asset class from the row, defaulting to equity. */
export function resolveLiveMarketRowAssetClass(
  row: LocalDatabaseRow,
  assetClassFieldId: string | undefined
): LiveAssetClass {
  if (assetClassFieldId === undefined) {
    return ASSET_CLASS_EQUITY;
  }
  const value = row.values[assetClassFieldId];
  if (value === "crypto" || value === "equity") {
    return value;
  }
  return ASSET_CLASS_EQUITY;
}

export type LiveMarketIdentityFailure =
  | "invalid-symbol"
  | "duplicate-symbol"
  | "at-capacity"
  | "keep-at-least-one";

export interface LiveMarketIdentityPlan {
  assetClass: LiveAssetClass;
  /** Next instruments list written to `source.config`. */
  instruments: LiveInstrument[];
  /** Whether `instruments` differs from the prior list (triggers sync). */
  instrumentsChanged: boolean;
  /** Next `externalId` — undefined clears a pending/emptied row. */
  nextExternalId: string | undefined;
  symbol: string | null;
}

export type LiveMarketIdentityPlanResult =
  | { ok: true; plan: LiveMarketIdentityPlan }
  | { ok: false; reason: LiveMarketIdentityFailure };

function resolvePatchedAssetClass(
  row: LocalDatabaseRow,
  assetClassFieldId: string | undefined,
  assetClassPatch: DatabaseCellValue | undefined
): LiveAssetClass {
  const current = resolveLiveMarketRowAssetClass(row, assetClassFieldId);
  if (assetClassPatch === undefined) {
    return current;
  }
  if (assetClassPatch === "crypto" || assetClassPatch === "equity") {
    return assetClassPatch;
  }
  if (assetClassPatch === null) {
    return ASSET_CLASS_EQUITY;
  }
  return current;
}

function resolvePatchedSymbol(
  previousSymbol: string | undefined,
  symbolPatch: DatabaseCellValue | undefined
):
  | { ok: true; symbol: string | null }
  | { ok: false; reason: "invalid-symbol" } {
  if (symbolPatch === undefined) {
    return {
      ok: true,
      symbol: previousSymbol === undefined ? null : previousSymbol,
    };
  }
  if (symbolPatch === null || symbolPatch === "") {
    return { ok: true, symbol: null };
  }
  if (typeof symbolPatch !== "string") {
    return { ok: false, reason: "invalid-symbol" };
  }
  const normalized = normalizeLiveMarketSymbol(symbolPatch);
  if (normalized === null) {
    return { ok: false, reason: "invalid-symbol" };
  }
  return { ok: true, symbol: normalized };
}

function clearInstrumentSymbol(
  prior: readonly LiveInstrument[],
  previousSymbol: string | undefined
):
  | { ok: true; instruments: LiveInstrument[] }
  | { ok: false; reason: "keep-at-least-one" } {
  if (previousSymbol === undefined) {
    return { ok: true, instruments: [...prior] };
  }
  const next = prior.filter(
    (instrument) => instrument.symbol !== previousSymbol
  );
  if (next.length === 0 && prior.length > 0) {
    return { ok: false, reason: "keep-at-least-one" };
  }
  return { ok: true, instruments: next };
}

function appendInstrument(
  prior: readonly LiveInstrument[],
  symbol: string,
  assetClass: LiveAssetClass
):
  | { ok: true; instruments: LiveInstrument[] }
  | { ok: false; reason: "duplicate-symbol" | "at-capacity" } {
  if (prior.some((instrument) => instrument.symbol === symbol)) {
    return { ok: false, reason: "duplicate-symbol" };
  }
  if (prior.length >= MAX_LIVE_MARKET_INSTRUMENTS) {
    return { ok: false, reason: "at-capacity" };
  }
  return {
    ok: true,
    instruments: [...prior, { symbol, assetClass }],
  };
}

function upsertInstrument(
  prior: readonly LiveInstrument[],
  previousSymbol: string,
  nextSymbol: string,
  assetClass: LiveAssetClass
):
  | { ok: true; instruments: LiveInstrument[] }
  | { ok: false; reason: "duplicate-symbol" | "at-capacity" } {
  if (previousSymbol === nextSymbol) {
    if (prior.some((instrument) => instrument.symbol === nextSymbol)) {
      return {
        ok: true,
        instruments: prior.map((instrument) =>
          instrument.symbol === nextSymbol
            ? { symbol: nextSymbol, assetClass }
            : instrument
        ),
      };
    }
    return appendInstrument(prior, nextSymbol, assetClass);
  }
  if (prior.some((instrument) => instrument.symbol === nextSymbol)) {
    return { ok: false, reason: "duplicate-symbol" };
  }
  if (prior.some((instrument) => instrument.symbol === previousSymbol)) {
    return {
      ok: true,
      instruments: prior.map((instrument) =>
        instrument.symbol === previousSymbol
          ? { symbol: nextSymbol, assetClass }
          : instrument
      ),
    };
  }
  return appendInstrument(prior, nextSymbol, assetClass);
}

/**
 * Plan a Symbol / Asset class commit: validate, rewrite the instrument list,
 * and decide the row's next `externalId`. Empty symbol on a pending row only
 * updates cells (no instrument write). Emptying the last committed ticker is
 * rejected (`keep-at-least-one`).
 */
export function planLiveMarketIdentityCommit(input: {
  assetClassFieldId: string | undefined;
  assetClassPatch?: DatabaseCellValue;
  instruments: readonly LiveInstrument[];
  row: LocalDatabaseRow;
  symbolFieldId: string | undefined;
  symbolPatch?: DatabaseCellValue;
}): LiveMarketIdentityPlanResult {
  const {
    assetClassFieldId,
    assetClassPatch,
    instruments,
    row,
    symbolFieldId,
    symbolPatch,
  } = input;

  const previousSymbol = resolveLiveMarketRowSymbol(row, symbolFieldId);
  const nextAssetClass = resolvePatchedAssetClass(
    row,
    assetClassFieldId,
    assetClassPatch
  );
  const symbolResult = resolvePatchedSymbol(previousSymbol, symbolPatch);
  if (!symbolResult.ok) {
    return symbolResult;
  }
  const nextSymbol = symbolResult.symbol;
  const prior = [...instruments];

  let instrumentsResult:
    | { ok: true; instruments: LiveInstrument[] }
    | {
        ok: false;
        reason: LiveMarketIdentityFailure;
      };

  if (nextSymbol === null) {
    instrumentsResult = clearInstrumentSymbol(prior, previousSymbol);
  } else if (previousSymbol === undefined || row.externalId === undefined) {
    instrumentsResult = appendInstrument(prior, nextSymbol, nextAssetClass);
  } else {
    instrumentsResult = upsertInstrument(
      prior,
      previousSymbol,
      nextSymbol,
      nextAssetClass
    );
  }

  if (!instrumentsResult.ok) {
    return instrumentsResult;
  }

  const nextInstruments = instrumentsResult.instruments;
  return {
    ok: true,
    plan: {
      assetClass: nextAssetClass,
      instruments: nextInstruments,
      instrumentsChanged:
        JSON.stringify(prior) !== JSON.stringify(nextInstruments),
      nextExternalId: nextSymbol ?? undefined,
      symbol: nextSymbol,
    },
  };
}

/**
 * Plan deleting live-market rows: drop matching instruments, refuse when that
 * would empty the watchlist (Settings parity: keep at least one). Pending
 * rows without a symbol never touch instruments.
 */
export function planLiveMarketRowDelete(input: {
  instruments: readonly LiveInstrument[];
  rows: readonly LocalDatabaseRow[];
  symbolFieldId: string | undefined;
}):
  | {
      ok: true;
      instruments: LiveInstrument[];
      instrumentsChanged: boolean;
      rowIds: string[];
    }
  | { ok: false; reason: "keep-at-least-one" } {
  const { instruments, rows, symbolFieldId } = input;
  const symbolsToRemove = new Set<string>();
  for (const row of rows) {
    const symbol = resolveLiveMarketRowSymbol(row, symbolFieldId);
    if (symbol !== undefined) {
      symbolsToRemove.add(symbol);
    }
  }

  const nextInstruments = instruments.filter(
    (instrument) => !symbolsToRemove.has(instrument.symbol)
  );
  if (nextInstruments.length === 0 && instruments.length > 0) {
    return { ok: false, reason: "keep-at-least-one" };
  }

  return {
    ok: true,
    instruments: nextInstruments,
    instrumentsChanged:
      JSON.stringify(instruments) !== JSON.stringify(nextInstruments),
    rowIds: rows.map((row) => row.id),
  };
}
