import { z } from "zod";
import { HTTP_STATUS_TOO_MANY_REQUESTS } from "@/lib/connectors/http.ts";
import {
  ConnectorError,
  type ConnectorFetchContext,
  type ConnectorFetchResult,
  type ConnectorHistoryPoint,
  type ConnectorHistoryRequest,
  type ConnectorRow,
  type ConnectorStreamHandlers,
  type HistoryResolution,
} from "@/lib/connectors/types.ts";

/**
 * Binance crypto transport: the keyless price/24h-change plumbing behind the
 * unified "Live" connector's `crypto` type (see `live-markets.ts`). One row
 * per configured trading pair (e.g. BTCUSDT). `binanceFetchRows` seeds current
 * price/24h-change from the REST `/ticker/24hr` endpoint (open CORS, no auth);
 * `binanceSubscribe` opens the combined `@ticker` WebSocket and pushes a keyed
 * upsert per trade frame; `binanceFetchHistory` backfills klines. No key, no
 * proxy — the browser connects directly.
 *
 * Uses the `*.binance.vision` market-data domains rather than the primary
 * `api.binance.com` / `stream.binance.com` hosts: the `.vision` mirrors are
 * the officially published, market-data-only endpoints with open CORS and no
 * geo restriction, so the browser can reach them from any region.
 */

const binanceConfigSchema = z.object({
  /** Trading pairs, e.g. "BTCUSDT", "ETHUSDT" (quote asset included). */
  symbols: z.array(z.string().min(1)).min(1),
});

type BinanceConfig = z.infer<typeof binanceConfigSchema>;

/** Subset of a REST `/ticker/24hr` entry mapped into cells. */
const binanceTickerSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  priceChangePercent: z.string(),
  closeTime: z.number(),
});

const binanceTickerListSchema = z.array(binanceTickerSchema);

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

/** Uppercased pairs for REST/externalId; lowercased for stream names. */
function normalizeSymbols(symbols: string[]): string[] {
  return symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
}

function isoDateFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, ISO_DATE_PART_LENGTH);
}

function tickerToRow(
  symbol: string,
  lastPrice: string,
  percent: string,
  eventMs: number
): ConnectorRow {
  const price = Number(lastPrice);
  const change = Number(percent);
  return {
    externalId: symbol,
    values: {
      symbol,
      price: Number.isFinite(price) ? price : null,
      change: Number.isFinite(change) ? change / PERCENT_TO_FRACTION : null,
      updatedAt: isoDateFromMs(eventMs),
    },
  };
}

async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  const symbols = normalizeSymbols(parseConfig(ctx.config).symbols);
  const params = new URLSearchParams({ symbols: JSON.stringify(symbols) });
  const url = `https://data-api.binance.vision/api/v3/ticker/24hr?${params.toString()}`;
  let response: Response;
  try {
    response = await ctx.fetchFn(url);
  } catch (cause) {
    throw new ConnectorError("Binance request failed", {
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
    throw new ConnectorError(`Binance request failed (${response.status})`, {
      kind: "network",
    });
  }
  const payload = binanceTickerListSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new ConnectorError("Unexpected Binance response shape", {
      kind: "network",
      cause: payload.error,
    });
  }
  const rows = payload.data.map((ticker) =>
    tickerToRow(
      ticker.symbol,
      ticker.lastPrice,
      ticker.priceChangePercent,
      ticker.closeTime
    )
  );
  return { kind: "rows", rows };
}

/**
 * Open the combined `@ticker` stream for the configured pairs. Each frame is a
 * single-row keyed upsert. A drop surfaces via `onError`; the engine owns
 * reconnect. The returned unsubscribe closes the socket without re-erroring.
 */
function subscribe(
  ctx: ConnectorFetchContext,
  handlers: ConnectorStreamHandlers
): () => void {
  const symbols = normalizeSymbols(parseConfig(ctx.config).symbols);
  const streams = symbols
    .map((symbol) => `${symbol.toLowerCase()}@ticker`)
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
    handlers.onRows([tickerToRow(s, c, P, E)]);
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
 * Historical backfill via Binance klines (keyless, direct). Returns close
 * price per candle at its open time, ascending. Keyless and open-CORS on the
 * `.vision` market-data host, so the browser fetches it directly.
 */
async function fetchHistory(
  ctx: ConnectorFetchContext,
  request: ConnectorHistoryRequest
): Promise<ConnectorHistoryPoint[]> {
  const symbol = request.externalId.trim().toUpperCase();
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

export {
  fetchHistory as binanceFetchHistory,
  fetchRows as binanceFetchRows,
  subscribe as binanceSubscribe,
};
