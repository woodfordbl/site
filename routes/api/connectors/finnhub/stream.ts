import { defineWebSocketHandler } from "nitro";

/**
 * `wss://<origin>/api/connectors/finnhub/stream?symbols=AAPL,MSFT` — same-origin
 * WebSocket proxy for Finnhub's real-time `trade` feed (Nitro native WebSocket,
 * powered by crossws).
 *
 * Each browser peer gets its own upstream Finnhub socket, opened server-side
 * with the `FINNHUB_API_KEY` env var so the key never reaches the client. The
 * proxy speaks Finnhub's native protocol transparently: it relays upstream
 * `trade` frames straight to the peer, and forwards the peer's
 * `{type:"subscribe"|"unsubscribe",symbol}` control messages upstream — but
 * only after validating each symbol against a strict allowlist and capping the
 * subscription count, so this publicly reachable route can't be turned into an
 * open relay against our Finnhub quota.
 *
 * Connections drop at the platform's max function duration; the sync engine
 * reconnects with backoff, so no server-side keep-alive is needed here.
 */

const SYMBOL_PATTERN = /^[A-Z0-9.:_-]{1,20}$/;
const MAX_SYMBOLS = 30;
const UPSTREAM_ENDPOINT = "wss://ws.finnhub.io";
const WS_CLOSE_UNAVAILABLE = 1011;

interface FinnhubPeerState {
  /** Control messages buffered until the upstream socket opens. */
  queue: string[];
  ready: boolean;
  /** Symbols this peer is currently subscribed to (for the per-peer cap). */
  symbols: Set<string>;
  upstream: WebSocket;
}

/** Parse, validate, dedupe and cap the seed symbols from the upgrade URL. */
function parseSeedSymbols(request: Request): Set<string> {
  const symbols = new Set<string>();
  const raw = new URL(request.url).searchParams.get("symbols") ?? "";
  for (const part of raw.split(",")) {
    const symbol = part.trim().toUpperCase();
    if (symbol && SYMBOL_PATTERN.test(symbol)) {
      symbols.add(symbol);
    }
    if (symbols.size >= MAX_SYMBOLS) {
      break;
    }
  }
  return symbols;
}

/** Send upstream if open, else buffer until the upstream `open` fires. */
function forwardUpstream(state: FinnhubPeerState, message: string): void {
  if (state.ready) {
    state.upstream.send(message);
  } else {
    state.queue.push(message);
  }
}

export default defineWebSocketHandler({
  upgrade() {
    // Reject early (before opening any socket) when the app key is absent.
    if (!process.env.FINNHUB_API_KEY) {
      throw new Response("Finnhub is not configured.", { status: 503 });
    }
  },

  open(peer) {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      peer.close(WS_CLOSE_UNAVAILABLE, "not configured");
      return;
    }
    const symbols = parseSeedSymbols(peer.request);
    const upstream = new WebSocket(
      `${UPSTREAM_ENDPOINT}?${new URLSearchParams({ token: apiKey }).toString()}`
    );
    const state: FinnhubPeerState = {
      upstream,
      ready: false,
      queue: [],
      symbols,
    };
    peer.context.finnhub = state;

    upstream.addEventListener("open", () => {
      state.ready = true;
      for (const symbol of symbols) {
        upstream.send(JSON.stringify({ type: "subscribe", symbol }));
      }
      for (const buffered of state.queue) {
        upstream.send(buffered);
      }
      state.queue = [];
    });
    upstream.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        peer.send(event.data);
      }
    });
    upstream.addEventListener("close", () => peer.close());
    upstream.addEventListener("error", () =>
      peer.close(WS_CLOSE_UNAVAILABLE, "upstream error")
    );
  },

  message(peer, message) {
    const state = peer.context.finnhub as FinnhubPeerState | undefined;
    if (!state) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = message.json();
    } catch {
      return; // Ignore non-JSON control frames.
    }
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    const { type, symbol } = parsed as { type?: unknown; symbol?: unknown };
    if (
      (type !== "subscribe" && type !== "unsubscribe") ||
      typeof symbol !== "string"
    ) {
      return;
    }
    const normalized = symbol.trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(normalized)) {
      return;
    }
    if (type === "subscribe") {
      if (state.symbols.size >= MAX_SYMBOLS && !state.symbols.has(normalized)) {
        return; // Cap reached; ignore new subscriptions.
      }
      state.symbols.add(normalized);
    } else {
      state.symbols.delete(normalized);
    }
    forwardUpstream(state, JSON.stringify({ type, symbol: normalized }));
  },

  close(peer) {
    const state = peer.context.finnhub as FinnhubPeerState | undefined;
    if (state) {
      try {
        state.upstream.close();
      } catch {
        // Upstream may already be closing; nothing to do.
      }
    }
  },
});
