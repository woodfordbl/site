import { z } from "zod";
import {
  binanceFetchHistory,
  binanceFetchRows,
  binanceSubscribe,
} from "@/lib/connectors/binance-stream.ts";
import {
  finnhubAuth,
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
  type ConnectorStreamHandlers,
} from "@/lib/connectors/types.ts";

/**
 * Unified "Live" connector: one synced source that streams real-time
 * price / % change / updated for either crypto pairs or stock tickers,
 * choosing the provider under the hood from a `type` selector — Binance's
 * keyless WebSocket for `crypto`, Finnhub (shared proxy or BYO token) for
 * `stocks`. Both types produce the identical field schema (`symbol`, `price`,
 * `change`, `updatedAt`), so switching provider never drifts columns; the
 * provider-specific transport lives in `binance-stream.ts` / `finnhub-quotes.ts`.
 *
 * A `currency` selector sets the Price column's display currency (default
 * USD). It is display-only — Binance pairs are quoted in their baked-in quote
 * asset and Finnhub returns each instrument's native currency, so a non-USD
 * choice only reformats the symbol; it never converts the value.
 */

const SECOND_MS = 1000;
const FIFTEEN_SECONDS_MS = 15 * SECOND_MS;
const MINUTE_MS = 60 * SECOND_MS;

const liveConfigSchema = z.object({
  /** Which provider/asset class backs this source. Fixed at creation. */
  type: z.enum(["crypto", "stocks"]),
  /** Trading pairs (crypto, e.g. "BTCUSDT") or tickers (stocks, e.g. "AAPL"). */
  symbols: z.array(z.string().min(1)).min(1),
  /** ISO 4217 display currency for the Price column. Display-only. */
  currency: z.string().default("USD"),
});

type LiveConfig = z.infer<typeof liveConfigSchema>;

/** Display-currency choices offered by the config selector. */
const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "CHF", label: "CHF — Swiss Franc" },
];

function parseConfig(config: Record<string, unknown>): LiveConfig {
  const parsed = liveConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new ConnectorError("Invalid Live connector config", {
      kind: "config",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** Both asset types share this schema; only `currency` varies the price cell. */
function liveFields(config: LiveConfig): ConnectorFieldDef[] {
  return [
    { sourceKey: "symbol", name: "Symbol", type: "text" },
    {
      sourceKey: "price",
      name: "Price",
      type: "number",
      numberFormat: "currency",
      currencyCode: config.currency,
      captureHistory: true,
    },
    {
      sourceKey: "change",
      name: "Change",
      type: "number",
      numberFormat: "percent",
    },
    { sourceKey: "updatedAt", name: "Updated", type: "date" },
  ];
}

// Async so a `parseConfig` config error surfaces as a rejection (matching the
// other connectors) rather than a synchronous throw.
// biome-ignore lint/suspicious/useAwait: delegates to a provider promise
async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  return parseConfig(ctx.config).type === "crypto"
    ? binanceFetchRows(ctx)
    : finnhubFetchRows(ctx);
}

function subscribe(
  ctx: ConnectorFetchContext,
  handlers: ConnectorStreamHandlers
): () => void {
  return parseConfig(ctx.config).type === "crypto"
    ? binanceSubscribe(ctx, handlers)
    : finnhubSubscribe(ctx, handlers);
}

/**
 * Historical backfill: Binance klines for `crypto`; none for `stocks`
 * (Finnhub has no free candle backfill — stock charts draw from live local
 * capture only, same as before the merge).
 */
// biome-ignore lint/suspicious/useAwait: delegates to a provider promise
async function fetchHistory(
  ctx: ConnectorFetchContext,
  request: ConnectorHistoryRequest
): Promise<ConnectorHistoryPoint[]> {
  return parseConfig(ctx.config).type === "crypto"
    ? binanceFetchHistory(ctx, request)
    : [];
}

/** Unified live crypto/stocks connector definition. */
export const liveMarketsConnector: ConnectorDefinition<LiveConfig> = {
  id: "live-markets",
  title: "Live",
  description:
    "Real-time price and change for crypto pairs or stock tickers, streamed over WebSocket.",
  icon: "tabler:IconActivityHeartbeat",
  configSchema: liveConfigSchema,
  configFields: [
    {
      key: "type",
      label: "Asset type",
      kind: "select",
      defaultValue: "crypto",
      creationOnly: true,
      options: [
        { value: "crypto", label: "Crypto" },
        { value: "stocks", label: "Stocks" },
      ],
    },
    {
      key: "symbols",
      label: "Symbols",
      placeholder: "BTCUSDT, ETHUSDT",
      kind: "list",
    },
    {
      key: "currency",
      label: "Display currency",
      kind: "select",
      defaultValue: "USD",
      options: CURRENCY_OPTIONS,
    },
  ],
  auth: finnhubAuth,
  fields(config) {
    return liveFields(config);
  },
  primarySourceKey: "symbol",
  fetchRows,
  fetchHistory,
  stream: { subscribe },
  pollPolicy: { minMs: FIFTEEN_SECONDS_MS, defaultMs: MINUTE_MS },
};
