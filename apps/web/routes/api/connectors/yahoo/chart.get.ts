import { defineHandler } from "nitro";
import { getQuery, setResponseHeader, setResponseStatus } from "nitro/h3";

/**
 * `GET /api/connectors/yahoo/chart?symbol=AAPL&interval=1h&from=&to=` — same-origin
 * proxy for Yahoo Finance's v8 chart endpoint. Used to backfill equity candles
 * for the Stocks and Crypto connector (Finnhub free has no `/stock/candle`).
 *
 * No API key. Symbols and intervals are allowlisted so this can't be turned
 * into an open relay. Returns normalized `{ t, v }[]` close points (ms, price).
 */

const SYMBOL_PATTERN = /^[A-Z0-9.:_-]{1,20}$/;
const CHART_ENDPOINT = "https://query1.finance.yahoo.com/v8/finance/chart";
const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;
const SECOND_MS = 1000;
/** Cap the requested span so a single call can't pull unbounded history. */
const MAX_RANGE_MS = 400 * 86_400_000;

/** Intervals we accept from the client (our HistoryResolution mapped). */
const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "60m", "1h", "1d"]);

interface HistoryPoint {
  t: number;
  v: number;
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
}

function firstNumber(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export default defineHandler(
  async (event): Promise<HistoryPoint[] | { error: string }> => {
    const query = getQuery(event);
    const symbol = firstString(query.symbol).trim().toUpperCase();
    const interval = firstString(query.interval).trim();
    const fromMs = firstNumber(query.from);
    const toMs = firstNumber(query.to);

    if (!(symbol && SYMBOL_PATTERN.test(symbol))) {
      setResponseStatus(event, HTTP_BAD_REQUEST);
      return { error: "Invalid symbol." };
    }
    if (!ALLOWED_INTERVALS.has(interval)) {
      setResponseStatus(event, HTTP_BAD_REQUEST);
      return { error: "Invalid interval." };
    }
    if (fromMs === null || toMs === null || toMs <= fromMs) {
      setResponseStatus(event, HTTP_BAD_REQUEST);
      return { error: "Invalid from/to range." };
    }
    if (toMs - fromMs > MAX_RANGE_MS) {
      setResponseStatus(event, HTTP_BAD_REQUEST);
      return { error: "Range too large." };
    }

    const url = new URL(`${CHART_ENDPOINT}/${encodeURIComponent(symbol)}`);
    url.searchParams.set("interval", interval);
    url.searchParams.set("period1", String(Math.floor(fromMs / SECOND_MS)));
    url.searchParams.set("period2", String(Math.ceil(toMs / SECOND_MS)));

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: {
          // Yahoo sometimes throttles bare fetches; a browser-like UA helps.
          "User-Agent": "Mozilla/5.0 (compatible; buhlake-site/1.0)",
        },
      });
    } catch {
      setResponseStatus(event, HTTP_BAD_GATEWAY);
      return { error: "Yahoo Finance request failed." };
    }
    if (!response.ok) {
      setResponseStatus(event, HTTP_BAD_GATEWAY);
      return { error: `Yahoo Finance failed (${response.status}).` };
    }

    const payload = (await response.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
        error?: unknown;
      };
    };
    const result = payload.chart?.result?.[0];
    const timestamps = result?.timestamp;
    const closes = result?.indicators?.quote?.[0]?.close;
    if (!(timestamps && closes) || timestamps.length === 0) {
      setResponseStatus(event, HTTP_BAD_GATEWAY);
      return { error: "Yahoo Finance returned no candles." };
    }

    const points: HistoryPoint[] = [];
    const length = Math.min(timestamps.length, closes.length);
    for (let index = 0; index < length; index += 1) {
      const close = closes[index];
      const seconds = timestamps[index];
      if (typeof close !== "number" || !Number.isFinite(close)) {
        continue;
      }
      if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
        continue;
      }
      points.push({ t: seconds * SECOND_MS, v: close });
    }

    if (points.length === 0) {
      setResponseStatus(event, HTTP_BAD_GATEWAY);
      return { error: "Yahoo Finance returned no usable closes." };
    }

    setResponseHeader(event, "Cache-Control", "public, max-age=60");
    return points;
  }
);
