import { defineHandler } from "nitro";
import { getQuery, setResponseHeader, setResponseStatus } from "nitro/h3";

import {
  finnhubMarketCapFromMillions,
  normalizeFinnhubCompanyName,
} from "@/lib/connectors/finnhub-profile.ts";

/**
 * `GET /api/connectors/finnhub/quote?symbols=AAPL,MSFT` — server-side proxy for
 * Finnhub's per-symbol `/quote` + `/stock/profile2` endpoints, used to seed the
 * "Stocks and Crypto" equity rows (and as the unwatched-refresh fallback).
 *
 * Each response entry carries live quote fields (`c`/`dp`/`t`) plus company
 * enrichment (`name`, `marketCap` in absolute currency units — Finnhub's
 * profile `marketCapitalization` is in millions and is scaled here).
 *
 * The Finnhub API key lives only in `FINNHUB_API_KEY` (server env) and never
 * reaches the browser — the client calls this same-origin route instead.
 * Requested symbols are validated against a strict allowlist and capped so the
 * publicly reachable route can't be turned into an open relay against our quota.
 */

const SYMBOL_PATTERN = /^[A-Z0-9.:_-]{1,20}$/;
const MAX_SYMBOLS = 30;
const QUOTE_ENDPOINT = "https://finnhub.io/api/v1/quote";
const PROFILE_ENDPOINT = "https://finnhub.io/api/v1/stock/profile2";
const HTTP_UNAVAILABLE = 503;
const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;

interface ProxyQuote {
  c: number;
  dp: number | null;
  marketCap: number | null;
  name: string | null;
  symbol: string;
  t: number;
}

interface RawFinnhubQuote {
  c: number;
  dp: number | null;
  t: number;
}

interface RawFinnhubProfile {
  marketCapitalization?: number;
  name?: string;
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  return typeof value === "string" ? value : "";
}

/** Parse, validate, dedupe and cap the requested symbols. */
function parseSymbols(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const symbol = part.trim().toUpperCase();
    if (symbol && SYMBOL_PATTERN.test(symbol)) {
      seen.add(symbol);
    }
    if (seen.size >= MAX_SYMBOLS) {
      break;
    }
  }
  return [...seen];
}

async function fetchJson(
  endpoint: string,
  symbol: string,
  apiKey: string
): Promise<unknown | null> {
  const url = new URL(endpoint);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("token", apiKey);
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return await response.json();
}

export default defineHandler(
  async (event): Promise<ProxyQuote[] | { error: string }> => {
    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      setResponseStatus(event, HTTP_UNAVAILABLE);
      return { error: "Finnhub is not configured (missing FINNHUB_API_KEY)." };
    }

    const symbols = parseSymbols(firstString(getQuery(event).symbols));
    if (symbols.length === 0) {
      setResponseStatus(event, HTTP_BAD_REQUEST);
      return { error: "No valid symbols requested." };
    }

    const quotes = await Promise.all(
      symbols.map(async (symbol): Promise<ProxyQuote | null> => {
        const [quoteRaw, profileRaw] = await Promise.all([
          fetchJson(QUOTE_ENDPOINT, symbol, apiKey),
          fetchJson(PROFILE_ENDPOINT, symbol, apiKey),
        ]);
        if (quoteRaw === null) {
          return null;
        }
        const quote = quoteRaw as RawFinnhubQuote;
        const profile =
          profileRaw !== null && typeof profileRaw === "object"
            ? (profileRaw as RawFinnhubProfile)
            : {};
        return {
          symbol,
          c: Number(quote.c),
          dp: quote.dp === null ? null : Number(quote.dp),
          t: Number(quote.t),
          name: normalizeFinnhubCompanyName(profile.name),
          marketCap: finnhubMarketCapFromMillions(profile.marketCapitalization),
        };
      })
    );

    const resolved = quotes.filter(
      (quote): quote is ProxyQuote => quote !== null
    );
    if (resolved.length === 0) {
      setResponseStatus(event, HTTP_BAD_GATEWAY);
      return { error: "Finnhub returned no quotes." };
    }

    // Live prices — never cache.
    setResponseHeader(event, "Cache-Control", "no-store");
    return resolved;
  }
);
