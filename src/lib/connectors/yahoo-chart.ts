import { z } from "zod";
import {
  ConnectorError,
  type ConnectorFetchContext,
  type ConnectorHistoryPoint,
  type ConnectorHistoryRequest,
  type HistoryResolution,
} from "@/lib/connectors/types.ts";

/**
 * Yahoo Finance equity candle transport for the Stocks and Crypto connector.
 * The browser talks only to the same-origin proxy (`/api/connectors/yahoo/chart`)
 * — Yahoo's chart API is CORS-blocked. Shared by `live-markets` `fetchHistory`
 * and TanStack Query backfill options.
 */

const PROXY_PATH = "/api/connectors/yahoo/chart";

/** Our chart resolutions → Yahoo chart intervals (`4h` has no Yahoo twin). */
const YAHOO_INTERVAL: Record<HistoryResolution, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "1h",
  "1d": "1d",
};

const historyPointSchema = z.object({
  t: z.number(),
  v: z.number(),
});

const historyListSchema = z.array(historyPointSchema);

/** Fetch normalized close points via the Yahoo proxy. */
export async function yahooFetchHistory(
  ctx: ConnectorFetchContext,
  request: ConnectorHistoryRequest
): Promise<ConnectorHistoryPoint[]> {
  const symbol = request.externalId.trim().toUpperCase();
  const params = new URLSearchParams({
    symbol,
    interval: YAHOO_INTERVAL[request.resolution],
    from: String(request.from),
    to: String(request.to),
  });
  const url = `${PROXY_PATH}?${params.toString()}`;
  let response: Response;
  try {
    response = await ctx.fetchFn(url);
  } catch (cause) {
    throw new ConnectorError("Yahoo chart request failed", {
      kind: "network",
      cause,
    });
  }
  if (!response.ok) {
    throw new ConnectorError(`Yahoo chart failed (${response.status})`, {
      kind: "network",
    });
  }
  const payload = historyListSchema.safeParse(await response.json());
  if (!payload.success) {
    throw new ConnectorError("Unexpected Yahoo chart response shape", {
      kind: "network",
      cause: payload.error,
    });
  }
  return payload.data;
}
