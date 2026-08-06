import { z } from "zod";
import {
  binanceFetchHistory,
  binanceSubscribe,
} from "@/lib/connectors/binance-stream.ts";
import { coingeckoCryptoFetchRows } from "@/lib/connectors/coingecko-markets.ts";
import {
  finnhubFetchRows,
  finnhubSubscribe,
} from "@/lib/connectors/finnhub-quotes.ts";
import {
  type ConnectorDefinition,
  ConnectorError,
  type ConnectorFetchContext,
  type ConnectorFetchResult,
  type ConnectorFieldDef,
  type ConnectorHistoryPoint,
  type ConnectorHistoryRequest,
  type ConnectorRow,
  type ConnectorStreamHandlers,
} from "@/lib/connectors/types.ts";
import { yahooFetchHistory } from "@/lib/connectors/yahoo-chart.ts";

/**
 * Unified "Stocks and Crypto" connector: one instrument list mixing crypto and
 * equity tickers. Each entry carries an explicit `assetClass` (set in the
 * create/settings UI via Stock / Crypto toggles):
 *
 * - **crypto** → CoinGecko seed + Binance live/history
 * - **equity** → Finnhub quote/profile/stream + Yahoo candle backfill
 *
 * Schema is a fixed superset. Name and Float come from CoinGecko (circulating
 * supply) / Finnhub `profile2` (shares outstanding). Market cap is float × price
 * when float is known (else the provider market-cap seed). Change is seeded from
 * the provider and refined from the price series once 24h coverage is ensured.
 * When both asset classes appear, the sync engine defaults the table view to
 * group by Asset class (unless the user opted out).
 */

const MINUTE_MS = 60_000;
const TWO_MINUTES_MS = 2 * MINUTE_MS;

/** Stable select option ids written into `assetClass` cells. */
export const ASSET_CLASS_CRYPTO = "crypto";
export const ASSET_CLASS_EQUITY = "equity";
export const MAX_LIVE_MARKET_INSTRUMENTS = 30;
export const LIVE_MARKET_SYMBOL_PATTERN = /^[A-Z0-9.:_-]{1,20}$/;

export type LiveAssetClass =
  | typeof ASSET_CLASS_CRYPTO
  | typeof ASSET_CLASS_EQUITY;

const liveInstrumentSchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(LIVE_MARKET_SYMBOL_PATTERN),
  assetClass: z.enum([ASSET_CLASS_CRYPTO, ASSET_CLASS_EQUITY]),
});

/** One configured ticker with its Stock / Crypto classification. */
export type LiveInstrument = z.infer<typeof liveInstrumentSchema>;

/** Parse the valid instruments from an untrusted connector config value. */
export function parseLiveInstruments(value: unknown): LiveInstrument[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const parsed = liveInstrumentSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Display-currency choices offered by the config selector. */
const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD (US Dollar)" },
  { value: "EUR", label: "EUR (Euro)" },
  { value: "GBP", label: "GBP (British Pound)" },
  { value: "JPY", label: "JPY (Japanese Yen)" },
  { value: "AUD", label: "AUD (Australian Dollar)" },
  { value: "CAD", label: "CAD (Canadian Dollar)" },
  { value: "CHF", label: "CHF (Swiss Franc)" },
];

const ASSET_CLASS_OPTIONS = [
  { id: ASSET_CLASS_CRYPTO, name: "Crypto", color: "orange" as const },
  { id: ASSET_CLASS_EQUITY, name: "Equity", color: "blue" as const },
];

function parseConfig(config: Record<string, unknown>): LiveConfig {
  const parsed = liveConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new ConnectorError("Invalid Stocks and Crypto connector config", {
      kind: "config",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/**
 * Trim/uppercase symbols, drop empties, and dedupe by symbol (first wins) so a
 * mistyped duplicate can't open two provider subscriptions.
 */
export function normalizeInstruments(
  instruments: readonly LiveInstrument[]
): LiveInstrument[] {
  const seen = new Set<string>();
  const next: LiveInstrument[] = [];
  for (const instrument of instruments) {
    const symbol = instrument.symbol.trim().toUpperCase();
    if (
      !LIVE_MARKET_SYMBOL_PATTERN.test(symbol) ||
      seen.has(symbol) ||
      next.length >= MAX_LIVE_MARKET_INSTRUMENTS
    ) {
      continue;
    }
    seen.add(symbol);
    next.push({ symbol, assetClass: instrument.assetClass });
  }
  return next;
}

const liveConfigSchema = z.object({
  /** Tickers with explicit asset class — normalized once at the config boundary. */
  instruments: z
    .array(liveInstrumentSchema)
    .min(1)
    .max(MAX_LIVE_MARKET_INSTRUMENTS)
    .transform(normalizeInstruments),
  /** ISO 4217 quote/display currency. Functional for crypto, display for equities. */
  currency: z.string().default("USD"),
});

type LiveConfig = z.infer<typeof liveConfigSchema>;

/** Partition configured instruments into crypto vs equity symbol lists. */
function partitionLiveMarketInstruments(
  instruments: readonly LiveInstrument[]
): { crypto: string[]; equity: string[] } {
  const crypto: string[] = [];
  const equity: string[] = [];
  for (const instrument of instruments) {
    (instrument.assetClass === ASSET_CLASS_CRYPTO ? crypto : equity).push(
      instrument.symbol
    );
  }
  return { crypto, equity };
}

/** Shared column schema for mixed crypto + equity rows. */
function liveFields(config: LiveConfig): ConnectorFieldDef[] {
  return [
    {
      sourceKey: "symbol",
      name: "Symbol",
      type: "text",
      icon: "tabler:IconActivityHeartbeat",
    },
    { sourceKey: "name", name: "Name", type: "text", icon: "tabler:IconTag" },
    {
      sourceKey: "assetClass",
      name: "Asset class",
      type: "select",
      options: ASSET_CLASS_OPTIONS,
      icon: "tabler:IconCategory",
    },
    {
      sourceKey: "price",
      name: "Price",
      type: "number",
      numberFormat: "currency",
      currencyCode: config.currency,
      captureHistory: true,
      icon: "tabler:IconCash",
    },
    {
      sourceKey: "change",
      name: "Change",
      type: "number",
      numberFormat: "percent",
      icon: "tabler:IconTrendingUp",
    },
    {
      sourceKey: "float",
      name: "Float",
      type: "number",
      numberFormat: "integer",
      icon: "tabler:IconStack2",
    },
    {
      sourceKey: "marketCap",
      name: "Market cap",
      type: "number",
      numberFormat: "integer",
      icon: "tabler:IconChartPie",
    },
    {
      sourceKey: "updatedAt",
      name: "Updated",
      type: "date",
      icon: "tabler:IconClock",
    },
  ];
}

function withAssetClass(
  row: ConnectorRow,
  assetClass: LiveAssetClass
): ConnectorRow {
  const float =
    typeof row.values.float === "number" && Number.isFinite(row.values.float)
      ? row.values.float
      : null;
  const price =
    typeof row.values.price === "number" && Number.isFinite(row.values.price)
      ? row.values.price
      : null;
  const derivedCap =
    float !== null && price !== null ? float * price : (row.values.marketCap ?? null);
  return {
    ...row,
    values: {
      ...row.values,
      assetClass,
      // Preserve provider enrichment (CoinGecko / Finnhub profile) when present.
      name: row.values.name ?? null,
      float,
      marketCap: derivedCap,
    },
  };
}

function orderRows(
  instruments: readonly LiveInstrument[],
  byId: Map<string, ConnectorRow>
): ConnectorRow[] {
  const rows: ConnectorRow[] = [];
  for (const instrument of instruments) {
    const row = byId.get(instrument.symbol);
    if (row) {
      rows.push(row);
    }
  }
  return rows;
}

async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  const { instruments, currency } = parseConfig(ctx.config);
  const { crypto, equity } = partitionLiveMarketInstruments(instruments);
  const byId = new Map<string, ConnectorRow>();

  if (crypto.length > 0) {
    const cryptoResult = await coingeckoCryptoFetchRows({
      ...ctx,
      config: { symbols: crypto, currency },
    });
    if (cryptoResult.kind !== "rows") {
      return cryptoResult;
    }
    for (const row of cryptoResult.rows) {
      byId.set(
        row.externalId.toUpperCase(),
        withAssetClass(row, ASSET_CLASS_CRYPTO)
      );
    }
  }

  if (equity.length > 0) {
    const equityResult = await finnhubFetchRows({
      ...ctx,
      config: { symbols: equity },
    });
    if (equityResult.kind === "rows") {
      for (const row of equityResult.rows) {
        byId.set(
          row.externalId.toUpperCase(),
          withAssetClass(row, ASSET_CLASS_EQUITY)
        );
      }
    } else if (crypto.length === 0) {
      return equityResult;
    }
  }

  return { kind: "rows", rows: orderRows(instruments, byId) };
}

function subscribe(
  ctx: ConnectorFetchContext,
  handlers: ConnectorStreamHandlers
): () => void {
  const { instruments, currency } = parseConfig(ctx.config);
  const { crypto, equity } = partitionLiveMarketInstruments(instruments);
  const teardowns: Array<() => void> = [];

  if (crypto.length > 0) {
    teardowns.push(
      binanceSubscribe(
        { ...ctx, config: { symbols: crypto, currency } },
        handlers
      )
    );
  }
  if (equity.length > 0) {
    teardowns.push(
      finnhubSubscribe({ ...ctx, config: { symbols: equity } }, handlers)
    );
  }

  return () => {
    for (const teardown of teardowns.splice(0)) {
      teardown();
    }
  };
}

/**
 * Historical backfill: Binance klines for crypto instruments; Yahoo Finance
 * chart proxy for equities. Classification comes from the configured
 * instrument list (not CoinGecko probing).
 */
async function fetchHistory(
  ctx: ConnectorFetchContext,
  request: ConnectorHistoryRequest
): Promise<ConnectorHistoryPoint[]> {
  const symbol = request.externalId.trim().toUpperCase();
  const { instruments, currency } = parseConfig(ctx.config);
  const match = instruments.find((entry) => entry.symbol === symbol);
  if (match?.assetClass === ASSET_CLASS_CRYPTO) {
    return await binanceFetchHistory(
      {
        ...ctx,
        config: {
          symbols: [symbol],
          currency,
        },
      },
      request
    );
  }
  return await yahooFetchHistory(ctx, request);
}

/** Unified live crypto/stocks connector definition. */
export const liveMarketsConnector: ConnectorDefinition<LiveConfig> = {
  id: "live-markets",
  title: "Stocks and Crypto",
  description:
    "Real-time prices for mixed crypto and equity tickers in one table.",
  icon: "tabler:IconActivityHeartbeat",
  configSchema: liveConfigSchema,
  configFields: [
    {
      key: "instruments",
      label: "Symbols",
      placeholder: "BTC",
      kind: "instrumentList",
    },
    {
      key: "currency",
      label: "Display currency",
      kind: "select",
      defaultValue: "USD",
      options: CURRENCY_OPTIONS,
    },
  ],
  fields(config) {
    return liveFields(config);
  },
  primarySourceKey: "symbol",
  fetchRows,
  fetchHistory,
  stream: { subscribe },
  // CoinGecko's free tier wants a slower cadence than Binance; the stricter
  // floor governs both types (streaming covers watched tabs anyway).
  pollPolicy: { minMs: MINUTE_MS, defaultMs: TWO_MINUTES_MS },
};
