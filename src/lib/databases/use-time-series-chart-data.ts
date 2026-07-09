import { useEffect, useMemo, useState } from "react";

import { readFieldHistory } from "@/db/history/field-history-store.ts";
import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import { getConnector } from "@/lib/connectors/registry.ts";
import { getConnectorToken } from "@/lib/connectors/token-store.ts";
import type {
  ConnectorDefinition,
  ConnectorFetchContext,
  ConnectorHistoryRequest,
} from "@/lib/connectors/types.ts";
import { formatCellValue } from "@/lib/databases/cell-values.ts";
import {
  clipToWindow,
  DEFAULT_TIME_WINDOW_MS,
  resolutionForWindow,
  stitchBucketMs,
  stitchSeries,
} from "@/lib/databases/time-series-chart-data.ts";
import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Async loader for time-axis chart data: for each synced row it reads the
 * forward-only local capture from the field-history store, backfills older
 * history via the connector's `fetchHistory` (cached), stitches the two, and
 * clips to the visible window. Re-reads on a short interval so live ticks
 * (which append to the store) extend the right edge.
 */

/** One symbol's line: stable key + display label + stitched points. */
export interface TimeSeriesLine {
  key: string;
  label: string;
  points: FieldHistoryPoint[];
}

export interface TimeSeriesChartData {
  from: number;
  series: TimeSeriesLine[];
  to: number;
}

export interface UseTimeSeriesResult {
  data: TimeSeriesChartData | null;
  loading: boolean;
}

/** Live re-read cadence (ms) — cheap: backfill is cached, local is in-memory.
 * Fast enough that the `Live` window's right edge visibly scrolls with ticks. */
const LIVE_REFRESH_MS = 2000;

/**
 * Backfill cache: provider candles are historical and immutable, so cache by
 * (database, symbol, resolution) and reuse whenever the cached range already
 * starts at or before the requested `from`.
 */
const backfillCache = new Map<
  string,
  { points: FieldHistoryPoint[]; from: number }
>();

async function loadBackfill(
  connector: ConnectorDefinition,
  ctx: ConnectorFetchContext,
  databaseId: string,
  request: ConnectorHistoryRequest
): Promise<FieldHistoryPoint[]> {
  if (!connector.fetchHistory) {
    return [];
  }
  const key = `${databaseId}:${request.externalId}:${request.resolution}`;
  const cached = backfillCache.get(key);
  if (cached && cached.from <= request.from) {
    return cached.points;
  }
  try {
    const points = await connector.fetchHistory(ctx, request);
    backfillCache.set(key, { points, from: request.from });
    return points;
  } catch {
    return cached?.points ?? [];
  }
}

interface RowMeta {
  externalId: string;
  label: string;
}

export function useTimeSeriesChartData(
  database: LocalDatabase,
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  fieldId: string | undefined,
  windowMs: number | undefined
): UseTimeSeriesResult {
  const effectiveWindow = windowMs ?? DEFAULT_TIME_WINDOW_MS;

  // Stable per-row identity + label; the memo lets the effect re-run only when
  // the set of symbols (or their labels) actually changes.
  const rowMeta = useMemo<RowMeta[]>(() => {
    const primaryField =
      fields.find((field) => field.id === database.primaryFieldId) ?? fields[0];
    const meta: RowMeta[] = [];
    for (const row of rows) {
      if (row.externalId === undefined) {
        continue;
      }
      const raw = primaryField ? row.values[primaryField.id] : undefined;
      const label =
        primaryField && raw !== undefined && raw !== null
          ? formatCellValue(primaryField, raw)
          : row.externalId;
      meta.push({ externalId: row.externalId, label });
    }
    return meta;
  }, [rows, fields, database.primaryFieldId]);

  const [data, setData] = useState<TimeSeriesChartData | null>(null);
  const [loading, setLoading] = useState(true);

  const source = database.source;
  const connectorId =
    source?.kind === "connector" ? source.connectorId : undefined;
  const databaseId = database.id;

  useEffect(() => {
    if (!fieldId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const activeFieldId = fieldId;
    const connector = connectorId ? getConnector(connectorId) : undefined;
    const connectorConfig = source?.kind === "connector" ? source.config : {};
    const resolution = resolutionForWindow(effectiveWindow);
    const bucketMs = stitchBucketMs(effectiveWindow);

    async function load() {
      const to = Date.now();
      const from = to - effectiveWindow;
      let ctx: ConnectorFetchContext | null = null;
      if (connector?.fetchHistory && connectorId) {
        const token = await Promise.resolve(
          getConnectorToken(connectorId)
        ).catch(() => undefined);
        ctx = {
          config: connectorConfig,
          fetchFn: (input, init) => fetch(input, init),
          token: token ?? undefined,
        };
      }
      const series = await Promise.all(
        rowMeta.map(async (meta): Promise<TimeSeriesLine> => {
          const local = clipToWindow(
            await readFieldHistory(databaseId, meta.externalId, activeFieldId),
            from,
            to
          );
          const backfill =
            connector && ctx
              ? await loadBackfill(connector, ctx, databaseId, {
                  externalId: meta.externalId,
                  from,
                  to,
                  resolution,
                })
              : [];
          const points = clipToWindow(
            stitchSeries(backfill, local, bucketMs),
            from,
            to
          );
          return { key: meta.externalId, label: meta.label, points };
        })
      );
      if (!cancelled) {
        setData({ series, from, to });
        setLoading(false);
      }
    }

    setLoading(true);
    load().catch(() => undefined);
    const interval = setInterval(() => {
      load().catch(() => undefined);
    }, LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [databaseId, connectorId, source, fieldId, effectiveWindow, rowMeta]);

  return { data, loading };
}
