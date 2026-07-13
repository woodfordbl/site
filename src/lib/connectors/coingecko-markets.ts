import { z } from "zod";
import {
  HTTP_STATUS_TOO_MANY_REQUESTS,
  retryAfterMsFromHeaders,
} from "@/lib/connectors/http.ts";
import {
  ConnectorError,
  type ConnectorFetchContext,
  type ConnectorFetchResult,
  type ConnectorRow,
} from "@/lib/connectors/types.ts";

/**
 * CoinGecko markets transport: the price / market-cap / real-currency plumbing
 * behind the unified "Live" connector's `crypto` type (see `live-markets.ts`).
 * One row per configured ticker, resolved by CoinGecko's `symbols` filter and
 * quoted in an arbitrary `vs_currency` (true conversion, unlike the Binance
 * live tick). Binance streaming overlays live price updates on top, keyed by
 * the same base-ticker `externalId`. Keyless public `/coins/markets` endpoint
 * (open CORS, no auth). No ETag: the payload changes on effectively every poll.
 */

const coingeckoConfigSchema = z.object({
  /** Base tickers, e.g. "BTC", "ETH" (the quote currency is `currency`). */
  symbols: z.array(z.string().min(1)).min(1),
  /** ISO 4217 quote currency; CoinGecko converts server-side. */
  currency: z.string().default("USD"),
});

/** The subset of a `/coins/markets` entry this connector maps into cells. */
const coingeckoMarketSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  current_price: z.number().nullable(),
  market_cap: z.number().nullable(),
  price_change_percentage_24h: z.number().nullable(),
  last_updated: z.string().nullable(),
});

const coingeckoMarketListSchema = z.array(coingeckoMarketSchema);

/**
 * CoinGecko reports 24h change as a percentage number (2.5 = 2.5%), but the
 * `percent` number format renders via `Intl.NumberFormat` fraction semantics
 * (0.025 → "2.5%", matching `formatCellValue` in
 * `lib/databases/cell-values.ts`) — so stored values divide by 100.
 */
const PERCENT_TO_FRACTION = 100;

function parseConfig(config: Record<string, unknown>): {
  symbols: string[];
  currency: string;
} {
  const parsed = coingeckoConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new ConnectorError("Invalid CoinGecko connector config", {
      kind: "config",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function toConnectorRow(
  coin: z.infer<typeof coingeckoMarketSchema>
): ConnectorRow {
  return {
    // Base ticker (uppercase) so the Binance live stream can key the same row.
    externalId: coin.symbol.toUpperCase(),
    values: {
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      change:
        coin.price_change_percentage_24h === null
          ? null
          : coin.price_change_percentage_24h / PERCENT_TO_FRACTION,
      marketCap: coin.market_cap,
      // Full ISO timestamp (with time) so the Updated column reflects the poll.
      updatedAt: coin.last_updated,
    },
  };
}

/** Market cap for ranking duplicate-ticker rows; missing sorts lowest. */
function marketCapOf(row: ConnectorRow): number {
  const value = row.values.marketCap;
  return typeof value === "number" ? value : Number.NEGATIVE_INFINITY;
}

/**
 * Keep the highest-market-cap coin when a ticker resolves to several — CoinGecko
 * usually returns market-cap-desc, but don't rely on order; pick the largest so
 * "BTC" never resolves to a low-cap impostor. First-seen order is preserved.
 */
function dedupeByExternalId(rows: ConnectorRow[]): ConnectorRow[] {
  const byId = new Map<string, ConnectorRow>();
  for (const row of rows) {
    const existing = byId.get(row.externalId);
    if (!existing || marketCapOf(row) > marketCapOf(existing)) {
      byId.set(row.externalId, row);
    }
  }
  return [...byId.values()];
}

/** Seed rows for the crypto type: price + market cap in the chosen currency. */
export async function coingeckoCryptoFetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  const { symbols, currency } = parseConfig(ctx.config);
  const params = new URLSearchParams({
    vs_currency: currency.toLowerCase(),
    symbols: symbols.map((symbol) => symbol.trim().toLowerCase()).join(","),
  });
  const url = `https://api.coingecko.com/api/v3/coins/markets?${params.toString()}`;
  let response: Response;
  try {
    response = await ctx.fetchFn(url);
  } catch (cause) {
    throw new ConnectorError("CoinGecko request failed", {
      kind: "network",
      cause,
    });
  }
  if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
    throw new ConnectorError("CoinGecko rate limit exceeded", {
      kind: "rateLimit",
      retryAfterMs: retryAfterMsFromHeaders(response.headers),
    });
  }
  if (!response.ok) {
    throw new ConnectorError(`CoinGecko request failed (${response.status})`, {
      kind: "network",
    });
  }
  const payload = coingeckoMarketListSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new ConnectorError("Unexpected CoinGecko response shape", {
      kind: "network",
      cause: payload.error,
    });
  }
  return {
    kind: "rows",
    rows: dedupeByExternalId(payload.data.map(toConnectorRow)),
  };
}
