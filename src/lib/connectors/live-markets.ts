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
  type ConnectorStreamHandlers,
} from "@/lib/connectors/types.ts";

/**
 * Unified "Live" connector: one synced source for either crypto or stocks,
 * chosen via a `type` selector and driven by simple base tickers (BTC, ETH /
 * AAPL, MSFT). The provider is picked under the hood:
 *
 * - **crypto** — CoinGecko seeds price + market cap in the chosen `currency`
 *   (true conversion), and Binance overlays live price ticks on top, keyed by
 *   the same base ticker. So the currency selector is *functional* here.
 * - **stocks** — Finnhub (shared proxy or BYO token) streams live quotes;
 *   currency is display-only (US tickers are quoted in USD natively).
 *
 * The asset type is fixed at creation (schema-locked): the two types carry
 * different columns (crypto adds Name / Market cap), so switching would drift
 * the schema. Transport lives in `coingecko-markets.ts` / `binance-stream.ts` /
 * `finnhub-quotes.ts`.
 */

const MINUTE_MS = 60_000;
const TWO_MINUTES_MS = 2 * MINUTE_MS;

const liveConfigSchema = z.object({
  /** Which provider/asset class backs this source. Fixed at creation. */
  type: z.enum(["crypto", "stocks"]),
  /** Base tickers — crypto ("BTC", "ETH") or stocks ("AAPL", "MSFT"). */
  symbols: z.array(z.string().min(1)).min(1),
  /** ISO 4217 quote/display currency. Functional for crypto, display for stocks. */
  currency: z.string().default("USD"),
});

type LiveConfig = z.infer<typeof liveConfigSchema>;

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

/** Crypto columns: CoinGecko-backed, with Name + Market cap. */
function cryptoFields(config: LiveConfig): ConnectorFieldDef[] {
  return [
    {
      sourceKey: "symbol",
      name: "Symbol",
      type: "text",
      icon: "tabler:IconCurrencyBitcoin",
    },
    { sourceKey: "name", name: "Name", type: "text", icon: "tabler:IconTag" },
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
      name: "24h change",
      type: "number",
      numberFormat: "percent",
      icon: "tabler:IconTrendingUp",
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

/** Stock columns: Finnhub-backed price + daily change. */
function stockFields(config: LiveConfig): ConnectorFieldDef[] {
  return [
    {
      sourceKey: "symbol",
      name: "Symbol",
      type: "text",
      icon: "tabler:IconChartCandle",
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
      sourceKey: "updatedAt",
      name: "Updated",
      type: "date",
      icon: "tabler:IconClock",
    },
  ];
}

// Async so a `parseConfig` config error surfaces as a rejection (matching the
// other connectors) rather than a synchronous throw.
// biome-ignore lint/suspicious/useAwait: delegates to a provider promise
async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  return parseConfig(ctx.config).type === "crypto"
    ? coingeckoCryptoFetchRows(ctx)
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
 * Historical backfill: Binance klines for `crypto` (composed from the currency's
 * quote asset); none for `stocks` (Finnhub has no free candle backfill — stock
 * charts draw from live local capture only).
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
    "Real-time price, change, and market cap for crypto or stock tickers.",
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
      placeholder: "BTC, ETH",
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
  fields(config) {
    return config.type === "crypto"
      ? cryptoFields(config)
      : stockFields(config);
  },
  primarySourceKey: "symbol",
  fetchRows,
  fetchHistory,
  stream: { subscribe },
  // CoinGecko's free tier wants a slower cadence than Binance; the stricter
  // floor governs both types (streaming covers watched tabs anyway).
  pollPolicy: { minMs: MINUTE_MS, defaultMs: TWO_MINUTES_MS },
};
