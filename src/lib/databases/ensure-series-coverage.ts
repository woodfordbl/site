import {
  mergeFieldHistory,
  readFieldHistory,
} from "@/db/history/field-history-store.ts";
import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import { getConnector } from "@/lib/connectors/registry.ts";
import { getConnectorToken } from "@/lib/connectors/token-store.ts";
import type {
  ConnectorDefinition,
  ConnectorFetchContext,
  HistoryResolution,
} from "@/lib/connectors/types.ts";
import {
  clipToWindow,
  resolutionForWindow,
  resolutionSpacingMs,
} from "@/lib/databases/time-series-chart-data.ts";

/**
 * Demand-driven series coverage: inspect local field-history span, fetch only
 * missing ranges via the connector `fetchHistory`, merge into the store, and
 * return the clipped window. Charts and live-markets derived Change share this
 * path so the second consumer does not re-hit the network for a covered range.
 */

/** Slack past the left edge that still counts as covered (½ candle). */
const COVERAGE_EDGE_SLACK_RATIO = 0.5;

/** Max concurrent `fetchHistory` calls across all ensure requests. */
const FETCH_CONCURRENCY = 4;

export interface SeriesCoverageRequest {
  databaseId: string;
  externalId: string;
  fieldId: string;
  /** Inclusive range start, epoch ms. */
  from: number;
  /** Candle resolution; defaults from window length via `resolutionForWindow`. */
  resolution?: HistoryResolution;
  /** Inclusive range end, epoch ms. */
  to: number;
}

export interface SeriesCoverageContext {
  /** Raw connector config from the database source. */
  config: Record<string, unknown>;
  /** Connector that owns `fetchHistory` (typically live-markets). */
  connector: ConnectorDefinition;
  fetchFn?: typeof fetch;
  token?: string;
}

/** One contiguous gap that still needs a provider backfill. */
export interface SeriesCoverageGap {
  from: number;
  to: number;
}

/**
 * Compute missing sub-ranges for `[from, to]` given an ascending local series.
 * Empty local → one full gap. When the earliest local point is after `from`
 * (beyond half-candle slack), the left uncovered slice is a gap. Right-edge
 * gaps are ignored — live ticks extend "now".
 */
export function computeSeriesCoverageGaps(
  points: readonly FieldHistoryPoint[],
  from: number,
  to: number,
  resolution: HistoryResolution
): SeriesCoverageGap[] {
  if (!(Number.isFinite(from) && Number.isFinite(to) && to >= from)) {
    return [];
  }
  const slack = resolutionSpacingMs(resolution) * COVERAGE_EDGE_SLACK_RATIO;
  if (points.length === 0) {
    return [{ from, to }];
  }
  const earliest = points[0].t;
  // A point at-or-before `from + slack` anchors valueAt(from).
  const hasLeftAnchor = points.some((point) => point.t <= from + slack);
  if (hasLeftAnchor) {
    return [];
  }
  // Fetch from requested `from` up to (but not past) the first local sample so
  // merge places candles under live capture.
  const gapTo = Math.min(to, earliest);
  if (gapTo <= from) {
    return [{ from, to: Math.max(from, earliest - 1) }];
  }
  return [{ from, to: gapTo }];
}

function inFlightKey(
  databaseId: string,
  externalId: string,
  fieldId: string,
  from: number,
  to: number,
  resolution: HistoryResolution
): string {
  // Bucket bounds to the resolution so near-identical windows share a fetch.
  const width = Math.max(1, resolutionSpacingMs(resolution));
  const fromBucket = Math.floor(from / width);
  const toBucket = Math.ceil(to / width);
  return `${databaseId}:${externalId}:${fieldId}:${fromBucket}:${toBucket}:${resolution}`;
}

const inFlight = new Map<string, Promise<FieldHistoryPoint[]>>();

/** Simple promise pool — runs at most `limit` tasks at once. */
async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Ensure local history covers `[from, to]` for one series, fetching gaps via
 * the connector when needed. Returns points clipped to the window.
 */
async function ensureOne(
  request: SeriesCoverageRequest,
  ctx: SeriesCoverageContext
): Promise<FieldHistoryPoint[]> {
  const { databaseId, externalId, fieldId, from, to } = request;
  const resolution =
    request.resolution ?? resolutionForWindow(Math.max(1, to - from));
  const key = inFlightKey(
    databaseId,
    externalId,
    fieldId,
    from,
    to,
    resolution
  );
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    const local = await readFieldHistory(databaseId, externalId, fieldId);
    const gaps = computeSeriesCoverageGaps(local, from, to, resolution);
    if (gaps.length > 0 && ctx.connector.fetchHistory) {
      const token =
        ctx.token ??
        (await Promise.resolve(getConnectorToken(ctx.connector.id)).catch(
          () => undefined
        )) ??
        undefined;
      const fetchCtx: ConnectorFetchContext = {
        config: ctx.config,
        fetchFn: ctx.fetchFn ?? globalThis.fetch.bind(globalThis),
        token,
      };
      const fetched = await mapPool(gaps, FETCH_CONCURRENCY, async (gap) => {
        try {
          return await ctx.connector.fetchHistory?.(fetchCtx, {
            externalId,
            from: gap.from,
            to: gap.to,
            resolution,
          });
        } catch {
          return [];
        }
      });
      const points = fetched.flat().filter((point) => point != null);
      if (points.length > 0) {
        await mergeFieldHistory([
          {
            databaseId,
            externalId,
            fieldId,
            points,
          },
        ]);
      }
    }
    const merged = await readFieldHistory(databaseId, externalId, fieldId);
    return clipToWindow(merged, from, to);
  })();

  inFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Ensure coverage for many rows (same field / window). In-flight dedupe +
 * concurrency limit prevent a 30-symbol Change column from stampeding.
 */
export async function ensureSeriesCoverageMany(
  requests: readonly SeriesCoverageRequest[],
  ctx: SeriesCoverageContext
): Promise<FieldHistoryPoint[][]> {
  return await mapPool(requests, FETCH_CONCURRENCY, (request) =>
    ensureOne(request, ctx)
  );
}
