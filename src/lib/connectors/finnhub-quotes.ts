import { z } from "zod";
import {
  HTTP_STATUS_TOO_MANY_REQUESTS,
  HTTP_STATUS_UNAUTHORIZED,
} from "@/lib/connectors/http.ts";
import {
  type ConnectorAuthSpec,
  ConnectorError,
  type ConnectorFetchContext,
  type ConnectorFetchResult,
  type ConnectorRow,
  type ConnectorStreamHandlers,
} from "@/lib/connectors/types.ts";

/**
 * Finnhub stocks transport: the price/daily-change plumbing behind the unified
 * "Live" connector's `stocks` type (see `live-markets.ts`). One row per
 * configured symbol (e.g. AAPL), seeded from the `/quote` REST endpoint and
 * streamed in real time from Finnhub's `trade` WebSocket.
 *
 * Finnhub requires an API key, so the transport is resolved from whether the
 * user supplied their own token:
 *
 * - **No BYO token** (the default) → the browser talks only to a same-origin
 *   proxy (`/api/connectors/finnhub/*`). The proxy injects the app's
 *   `FINNHUB_API_KEY` (a server-only env var) so users get live data with zero
 *   setup and the key never reaches the client.
 * - **BYO token** → the browser connects directly to Finnhub with the user's
 *   own token (their token, their choice), skipping the proxy entirely.
 *
 * Either way the wire shapes are identical — the REST proxy mirrors Finnhub's
 * quote payload and the WS proxy relays Finnhub's native `trade` frames — so
 * the parsing below is transport-agnostic; only the endpoint and token differ.
 */

const finnhubConfigSchema = z.object({
  /** Ticker symbols, e.g. "AAPL", "MSFT" (or "BINANCE:BTCUSDT" for crypto). */
  symbols: z.array(z.string().min(1)).min(1),
});

type FinnhubConfig = z.infer<typeof finnhubConfigSchema>;

/** Direct-mode `/quote` payload (the fields mapped into cells). */
const finnhubQuoteSchema = z.object({
  c: z.number(), // current price
  dp: z.number().nullable(), // percent change (e.g. 1.5 = 1.5%)
  t: z.number(), // quote time (unix seconds)
});

/** Proxy-mode `/quote` payload — one entry per symbol, symbol included. */
const proxyQuoteListSchema = z.array(
  z.object({
    symbol: z.string(),
    c: z.number(),
    dp: z.number().nullable(),
    t: z.number(),
  })
);

/** A `trade` frame (identical direct and via proxy). Non-trade frames (`ping`)
 * fail this parse and are ignored. Finnhub trade `t` is in milliseconds. */
const finnhubTradeFrameSchema = z.object({
  type: z.literal("trade"),
  data: z.array(
    z.object({
      s: z.string(), // symbol
      p: z.number(), // price
      t: z.number(), // trade time (ms)
    })
  ),
});

/** Percent format renders fractions (0.015 → "1.5%"); Finnhub reports 1.5. */
const PERCENT_TO_FRACTION = 100;
const SECOND_MS = 1000;

const DIRECT_REST_ENDPOINT = "https://finnhub.io/api/v1/quote";
const DIRECT_WS_ENDPOINT = "wss://ws.finnhub.io";
const PROXY_REST_PATH = "/api/connectors/finnhub/quote";
const PROXY_WS_PATH = "/api/connectors/finnhub/stream";

function parseConfig(config: Record<string, unknown>): FinnhubConfig {
  const parsed = finnhubConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new ConnectorError("Invalid Finnhub connector config", {
      kind: "config",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

function normalizeSymbols(symbols: string[]): string[] {
  return symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
}

/** BYO token present → connect directly; absent → route through the proxy. */
function hasToken(ctx: ConnectorFetchContext): ctx is ConnectorFetchContext & {
  token: string;
} {
  return typeof ctx.token === "string" && ctx.token.length > 0;
}

/** Full ISO timestamp (with time) so the Updated column reflects the quote. */
function isoTimestampFromMs(ms: number): string {
  const safeMs = ms > 0 ? ms : Date.now();
  return new Date(safeMs).toISOString();
}

/** Full row from a quote seed (price + percent change + time). */
function quoteToRow(
  symbol: string,
  price: number,
  percent: number | null,
  timeMs: number
): ConnectorRow {
  return {
    externalId: symbol,
    values: {
      symbol,
      price: Number.isFinite(price) ? price : null,
      change:
        percent !== null && Number.isFinite(percent)
          ? percent / PERCENT_TO_FRACTION
          : null,
      updatedAt: isoTimestampFromMs(timeMs),
    },
  };
}

/** Partial row from a live trade tick (price only). `applyStreamTick` merges,
 * so the omitted `change` keeps its last seeded value. */
function tradeToRow(
  symbol: string,
  price: number,
  timeMs: number
): ConnectorRow {
  return {
    externalId: symbol,
    values: {
      symbol,
      price: Number.isFinite(price) ? price : null,
      updatedAt: isoTimestampFromMs(timeMs),
    },
  };
}

/** Map a fetch failure to the right `ConnectorError` kind for the scheduler. */
function assertResponseOk(response: Response, provider: string): void {
  if (response.status === HTTP_STATUS_UNAUTHORIZED) {
    throw new ConnectorError(`${provider} token was rejected`, {
      kind: "auth",
    });
  }
  if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
    throw new ConnectorError(`${provider} rate limit exceeded`, {
      kind: "rateLimit",
    });
  }
  if (!response.ok) {
    throw new ConnectorError(
      `${provider} request failed (${response.status})`,
      {
        kind: "network",
      }
    );
  }
}

/** Seed via direct per-symbol `/quote` calls with the user's BYO token. */
async function fetchDirect(
  ctx: ConnectorFetchContext & { token: string },
  symbols: string[]
): Promise<ConnectorRow[]> {
  return await Promise.all(
    symbols.map(async (symbol) => {
      const params = new URLSearchParams({ symbol, token: ctx.token });
      const url = `${DIRECT_REST_ENDPOINT}?${params.toString()}`;
      let response: Response;
      try {
        response = await ctx.fetchFn(url);
      } catch (cause) {
        throw new ConnectorError("Finnhub request failed", {
          kind: "network",
          cause,
        });
      }
      assertResponseOk(response, "Finnhub");
      const quote = finnhubQuoteSchema.safeParse(await response.json());
      if (!quote.success) {
        throw new ConnectorError("Unexpected Finnhub response shape", {
          kind: "network",
          cause: quote.error,
        });
      }
      return quoteToRow(
        symbol,
        quote.data.c,
        quote.data.dp,
        quote.data.t * SECOND_MS
      );
    })
  );
}

/** Seed via the same-origin proxy (server injects the app key). */
async function fetchProxy(
  ctx: ConnectorFetchContext,
  symbols: string[]
): Promise<ConnectorRow[]> {
  const params = new URLSearchParams({ symbols: symbols.join(",") });
  const url = `${PROXY_REST_PATH}?${params.toString()}`;
  let response: Response;
  try {
    response = await ctx.fetchFn(url);
  } catch (cause) {
    throw new ConnectorError("Finnhub proxy request failed", {
      kind: "network",
      cause,
    });
  }
  assertResponseOk(response, "Finnhub");
  const list = proxyQuoteListSchema.safeParse(await response.json());
  if (!list.success) {
    throw new ConnectorError("Unexpected Finnhub proxy response shape", {
      kind: "network",
      cause: list.error,
    });
  }
  return list.data.map((quote) =>
    quoteToRow(quote.symbol, quote.c, quote.dp, quote.t * SECOND_MS)
  );
}

async function fetchRows(
  ctx: ConnectorFetchContext
): Promise<ConnectorFetchResult> {
  const symbols = normalizeSymbols(parseConfig(ctx.config).symbols);
  const rows = hasToken(ctx)
    ? await fetchDirect(ctx, symbols)
    : await fetchProxy(ctx, symbols);
  return { kind: "rows", rows };
}

/** Same-origin `wss://` URL for the stream proxy, carrying the seed symbols. */
function proxyWsUrl(symbols: string[]): string {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ symbols: symbols.join(",") });
  return `${wsProtocol}//${window.location.host}${PROXY_WS_PATH}?${params.toString()}`;
}

/**
 * Open the Finnhub `trade` stream for the configured symbols. Both transports
 * speak Finnhub's native protocol: send `{type:"subscribe",symbol}` per symbol
 * on open, receive `{type:"trade",data:[…]}` frames. A drop surfaces via
 * `onError`; the engine owns reconnect. The returned unsubscribe unsubscribes
 * each symbol and closes the socket without re-erroring.
 */
function subscribe(
  ctx: ConnectorFetchContext,
  handlers: ConnectorStreamHandlers
): () => void {
  const symbols = normalizeSymbols(parseConfig(ctx.config).symbols);
  const url = hasToken(ctx)
    ? `${DIRECT_WS_ENDPOINT}?${new URLSearchParams({ token: ctx.token }).toString()}`
    : proxyWsUrl(symbols);

  let closedByUs = false;
  const socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    for (const symbol of symbols) {
      socket.send(JSON.stringify({ type: "subscribe", symbol }));
    }
  });

  socket.addEventListener("message", (event) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data as string);
    } catch {
      return; // Ignore unparseable frames.
    }
    const frame = finnhubTradeFrameSchema.safeParse(parsed);
    if (!frame.success) {
      return; // Ignore non-trade frames (e.g. `{type:"ping"}`).
    }
    const rows = frame.data.data.map((trade) =>
      tradeToRow(trade.s, trade.p, trade.t)
    );
    if (rows.length > 0) {
      handlers.onRows(rows);
    }
  });

  socket.addEventListener("error", () => {
    if (!closedByUs) {
      handlers.onError(
        new ConnectorError("Finnhub stream error", { kind: "network" })
      );
    }
  });

  socket.addEventListener("close", () => {
    if (!closedByUs) {
      handlers.onError(
        new ConnectorError("Finnhub stream closed", { kind: "network" })
      );
    }
  });

  return () => {
    closedByUs = true;
    try {
      for (const symbol of symbols) {
        socket.send(JSON.stringify({ type: "unsubscribe", symbol }));
      }
    } catch {
      // Socket may already be closing; nothing to unsubscribe.
    }
    socket.close();
  };
}

/**
 * BYO-token auth for the Finnhub-backed stocks transport. Only consulted for
 * the unified "Live" connector's `stocks` type; the `crypto` type is keyless.
 */
export const finnhubAuth: ConnectorAuthSpec = {
  kind: "token",
  label: "Finnhub API token",
  help: "Optional. Leave blank to use the site's shared key (routed through a same-origin proxy). Provide your own free finnhub.io token to connect directly instead.",
  required: false,
};

export { fetchRows as finnhubFetchRows, subscribe as finnhubSubscribe };
