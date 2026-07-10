import { z } from "zod";
import { HTTP_STATUS_TOO_MANY_REQUESTS } from "@/lib/connectors/http.ts";
import {
  ConnectorError,
  type ConnectorFetchContext,
  type ConnectorHistoryPoint,
  type ConnectorHistoryRequest,
  type ConnectorRow,
  type ConnectorStreamHandlers,
  type HistoryResolution,
} from "@/lib/connectors/types.ts";

/**
 * Binance live-tick transport: the keyless price streaming/backfill plumbing
 * behind the unified "Live" connector's `crypto` type (see `live-markets.ts`).
 * CoinGecko seeds the rows (price + market cap in the chosen currency); Binance
 * overlays live price updates. Config symbols are BASE tickers (e.g. "BTC") —
 * the trading pair is composed from the display `currency` (USD→USDT, EUR→EUR,
 * …). Rows are keyed by the base ticker so ticks land on the CoinGecko row.
 * `binanceSubscribe` opens the combined `@ticker` WebSocket; `binanceFetchHistory`
 * backfills klines. No key, no proxy — the browser connects directly.
 *
 * Uses the `*.binance.vision` market-data domains rather than the primary
 * `api.binance.com` / `stream.binance.com` hosts: the `.vision` mirrors are
 * the officially published, market-data-only endpoints with open CORS and no
 * geo restriction, so the browser can reach them from any region.
 */

const binanceConfigSchema = z.object({
  /** Base tickers, e.g. "BTC", "ETH"; the quote asset comes from `currency`. */
  symbols: z.array(z.string().min(1)).min(1),
  /** ISO 4217 display currency; maps to a Binance quote asset. */
  currency: z.string().default("USD"),
});

type BinanceConfig = z.infer<typeof binanceConfigSchema>;

/**
 * Display currency → Binance quote asset. Binance's "USD" market is USDT.
 * Currencies without a listed quote asset are absent — those stream nothing
 * (CoinGecko polling still updates the rows).
 */
const CURRENCY_TO_BINANCE_QUOTE: Record<string, string | undefined> = {
  USD: "USDT",
  EUR: "EUR",
  GBP: "GBP",
};

/** One combined-stream frame: `{ stream, data }` with a 24hrTicker payload. */
const binanceStreamFrameSchema = z.object({
  data: z.object({
    s: z.string(), // symbol, e.g. "BTCUSDT"
    c: z.string(), // last price
    P: z.string(), // 24h price-change percent
    E: z.number(), // event time (ms)
  }),
});

/** Percent format renders fractions (0.025 → "2.5%"); Binance reports 2.5. */
const PERCENT_TO_FRACTION = 100;
const ISO_DATE_PART_LENGTH = 10;

function parseConfig(config: Record<string, unknown>): BinanceConfig {
  const parsed = binanceConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new ConnectorError("Invalid Binance connector config", {
      kind: "config",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** Uppercased, de-duped base tickers. */
function normalizeSymbols(symbols: string[]): string[] {
  return [
    ...new Set(
      symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
    ),
  ];
}

/** The Binance quote asset for a display currency, if one is listed. */
function quoteAssetFor(currency: string): string | undefined {
  return CURRENCY_TO_BINANCE_QUOTE[currency.trim().toUpperCase()];
}

function isoDateFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, ISO_DATE_PART_LENGTH);
}

/**
 * Partial tick row keyed by the base ticker (`externalId`). Only price /
 * change / updatedAt are written; `applyStreamTick` merges, so the CoinGecko
 * seed's name and market cap are preserved.
 */
function tickToRow(
  base: string,
  lastPrice: string,
  percent: string,
  eventMs: number
): ConnectorRow {
  const price = Number(lastPrice);
  const change = Number(percent);
  return {
    externalId: base,
    values: {
      symbol: base,
      price: Number.isFinite(price) ? price : null,
      change: Number.isFinite(change) ? change / PERCENT_TO_FRACTION : null,
      updatedAt: isoDateFromMs(eventMs),
    },
  };
}

/**
 * Open the combined `@ticker` stream for the configured tickers, composing each
 * pair from the display currency's quote asset. Ticks are keyed back to the
 * base ticker so they overlay the CoinGecko rows. When the currency has no
 * Binance quote asset, there is nothing to stream and a no-op teardown is
 * returned (CoinGecko polling still refreshes the rows). A drop surfaces via
 * `onError`; the engine owns reconnect.
 */
function subscribe(
  ctx: ConnectorFetchContext,
  handlers: ConnectorStreamHandlers
): () => void {
  const { symbols, currency } = parseConfig(ctx.config);
  const quote = quoteAssetFor(currency);
  const bases = normalizeSymbols(symbols);
  if (!quote || bases.length === 0) {
    return () => {
      // Nothing streamed — poll-only for this currency.
    };
  }

  // Map the composed pair back to its base ticker for keying rows.
  const pairToBase = new Map<string, string>();
  for (const base of bases) {
    pairToBase.set(`${base}${quote}`, base);
  }
  const streams = [...pairToBase.keys()]
    .map((pair) => `${pair.toLowerCase()}@ticker`)
    .join("/");
  const url = `wss://data-stream.binance.vision/stream?streams=${streams}`;

  let closedByUs = false;
  const socket = new WebSocket(url);

  socket.addEventListener("message", (event) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data as string);
    } catch {
      return; // Ignore unparseable frames (e.g. control messages).
    }
    const frame = binanceStreamFrameSchema.safeParse(parsed);
    if (!frame.success) {
      return;
    }
    const { s, c, P, E } = frame.data.data;
    const base = pairToBase.get(s.toUpperCase());
    if (base) {
      handlers.onRows([tickToRow(base, c, P, E)]);
    }
  });

  socket.addEventListener("error", () => {
    if (!closedByUs) {
      handlers.onError(
        new ConnectorError("Binance stream error", { kind: "network" })
      );
    }
  });

  socket.addEventListener("close", () => {
    if (!closedByUs) {
      handlers.onError(
        new ConnectorError("Binance stream closed", { kind: "network" })
      );
    }
  });

  return () => {
    closedByUs = true;
    socket.close();
  };
}

/** Canonical resolution → Binance kline interval (identical strings here). */
const BINANCE_INTERVAL: Record<HistoryResolution, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

/** Max candles Binance returns per klines request. */
const BINANCE_KLINES_LIMIT = 1000;

/** One kline row is a positional array; index 0 = openTime, 4 = close. */
const KLINE_OPEN_TIME_INDEX = 0;
const KLINE_CLOSE_INDEX = 4;

/**
 * Historical backfill via Binance klines (keyless, direct). `request.externalId`
 * is the base ticker; the pair is composed from the config currency's quote
 * asset. Returns close price per candle at its open time, ascending. When the
 * currency has no Binance quote asset, returns no points (chart draws from live
 * local capture only).
 */
async function fetchHistory(
  ctx: ConnectorFetchContext,
  request: ConnectorHistoryRequest
): Promise<ConnectorHistoryPoint[]> {
  const quote = quoteAssetFor(parseConfig(ctx.config).currency);
  if (!quote) {
    return [];
  }
  const symbol = `${request.externalId.trim().toUpperCase()}${quote}`;
  const params = new URLSearchParams({
    symbol,
    interval: BINANCE_INTERVAL[request.resolution],
    startTime: String(request.from),
    endTime: String(request.to),
    limit: String(BINANCE_KLINES_LIMIT),
  });
  const url = `https://data-api.binance.vision/api/v3/klines?${params.toString()}`;
  let response: Response;
  try {
    response = await ctx.fetchFn(url);
  } catch (cause) {
    throw new ConnectorError("Binance klines request failed", {
      kind: "network",
      cause,
    });
  }
  if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
    throw new ConnectorError("Binance rate limit exceeded", {
      kind: "rateLimit",
    });
  }
  if (!response.ok) {
    throw new ConnectorError(`Binance klines failed (${response.status})`, {
      kind: "network",
    });
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new ConnectorError("Unexpected Binance klines shape", {
      kind: "network",
    });
  }
  const points: ConnectorHistoryPoint[] = [];
  for (const candle of payload) {
    if (!Array.isArray(candle)) {
      continue;
    }
    const t = Number(candle[KLINE_OPEN_TIME_INDEX]);
    const v = Number(candle[KLINE_CLOSE_INDEX]);
    if (Number.isFinite(t) && Number.isFinite(v)) {
      points.push({ t, v });
    }
  }
  return points;
}

export { fetchHistory as binanceFetchHistory, subscribe as binanceSubscribe };
