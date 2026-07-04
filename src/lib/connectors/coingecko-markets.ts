import { z } from "zod";
import {
  HTTP_STATUS_TOO_MANY_REQUESTS,
  retryAfterMsFromHeaders,
} from "@/lib/connectors/http.ts";
import {
  type ConnectorDefinition,
  ConnectorError,
  type ConnectorFetchContext,
  type ConnectorFetchResult,
  type ConnectorFieldDef,
  type ConnectorRow,
} from "@/lib/connectors/types.ts";

/**
 * CoinGecko crypto markets connector: one row per configured coin id, USD
 * quotes from the keyless public `/coins/markets` endpoint (open CORS, no
 * auth — proposal §4.1). No ETag support: the endpoint's payload changes on
 * effectively every poll, so conditional requests would never hit.
 */

const coingeckoMarketsConfigSchema = z.object({
  /** CoinGecko coin ids (e.g. "bitcoin", "ethereum") — not ticker symbols. */
  coinIds: z.array(z.string().min(1)).min(1),
});

type CoingeckoMarketsConfig = z.infer<typeof coingeckoMarketsConfigSchema>;

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

const COINGECKO_MARKET_FIELDS: ConnectorFieldDef[] = [
  { sourceKey: "name", name: "Name", type: "text" },
  { sourceKey: "symbol", name: "Symbol", type: "text" },
  {
    sourceKey: "price",
    name: "Price",
    type: "number",
    numberFormat: "currency",
  },
  {
    sourceKey: "change24h",
    name: "24h change",
    type: "number",
    numberFormat: "percent",
  },
  {
    sourceKey: "marketCap",
    name: "Market cap",
    type: "number",
    numberFormat: "integer",
  },
  { sourceKey: "updatedAt", name: "Updated", type: "date" },
];

/**
 * CoinGecko reports 24h change as a percentage number (2.5 = 2.5%), but the
 * `percent` number format renders via `Intl.NumberFormat` fraction semantics
 * (0.025 → "2.5%", matching `formatCellValue` in
 * `lib/databases/cell-values.ts`) — so stored values divide by 100.
 */
const PERCENT_TO_FRACTION = 100;

const ISO_DATE_PART_LENGTH = 10;

const MINUTE_MS = 60_000;
const TWO_MINUTES_MS = 2 * MINUTE_MS;

function parseConfig(config: Record<string, unknown>): CoingeckoMarketsConfig {
  const parsed = coingeckoMarketsConfigSchema.safeParse(config);
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
    externalId: coin.id,
    values: {
      name: coin.name,
      // Uppercased for display — CoinGecko returns lowercase ("btc").
      symbol: coin.symbol.toUpperCase(),
      price: coin.current_price,
      change24h:
        coin.price_change_percentage_24h === null
          ? null
          : coin.price_change_percentage_24h / PERCENT_TO_FRACTION,
      marketCap: coin.market_cap,
      updatedAt: coin.last_updated
        ? coin.last_updated.slice(0, ISO_DATE_PART_LENGTH)
        : null,
    },
  };
}

async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  const { coinIds } = parseConfig(ctx.config);
  const params = new URLSearchParams({
    vs_currency: "usd",
    ids: coinIds.join(","),
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
  return { kind: "rows", rows: payload.data.map(toConnectorRow) };
}

/** CoinGecko crypto-markets connector definition. */
export const coingeckoMarketsConnector: ConnectorDefinition<CoingeckoMarketsConfig> =
  {
    id: "coingecko-markets",
    title: "Crypto prices",
    description:
      "USD price, 24h change, and market cap for a CoinGecko coin watchlist.",
    icon: "tabler:IconCoinBitcoin",
    configSchema: coingeckoMarketsConfigSchema,
    configFields: [
      {
        key: "coinIds",
        label: "Coin ids",
        placeholder: "bitcoin, ethereum",
        kind: "list",
      },
    ],
    fields() {
      return COINGECKO_MARKET_FIELDS;
    },
    primarySourceKey: "name",
    fetchRows,
    pollPolicy: { minMs: MINUTE_MS, defaultMs: TWO_MINUTES_MS },
  };
