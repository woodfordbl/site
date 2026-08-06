import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { readFieldHistory } from "@/db/history/field-history-store.ts";
import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import { getConnector } from "@/lib/connectors/registry.ts";
import { getConnectorToken } from "@/lib/connectors/token-store.ts";
import type {
  ConnectorFetchContext,
  ConnectorHistoryPoint,
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
 * history via TanStack Query (Binance / Yahoo / connector `fetchHistory`),
 * stitches the two, and clips to the visible window. Re-reads local capture on
 * a short interval so live ticks extend the right edge.
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

/** Live re-read cadence (ms) — cheap: backfill is RQ-cached, local is in-memory.
 * Fast enough that the `Live` window's right edge visibly scrolls with ticks. */
const LIVE_REFRESH_MS = 2000;

/** Provider candles are historical; keep them fresh enough for scrolling windows. */
const BACKFILL_STALE_MS = 60_000;
const EMPTY_BACKFILL_POINTS: ConnectorHistoryPoint[][] = [];

interface RowMeta {
  externalId: string;
  label: string;
}

/** Content key for a row set — the parts the loader actually reads. */
function rowMetaSignature(meta: readonly RowMeta[]): string {
  return meta
    .map((entry) => `${entry.externalId}\u0000${entry.label}`)
    .join("\u0001");
}

export function useTimeSeriesChartData(
  database: LocalDatabase,
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  fieldId: string | undefined,
  windowMs: number | undefined
): UseTimeSeriesResult {
  const effectiveWindow = windowMs ?? DEFAULT_TIME_WINDOW_MS;
  const resolution = resolutionForWindow(effectiveWindow);
  const bucketMs = stitchBucketMs(effectiveWindow);

  const tickedRowMeta = useMemo<RowMeta[]>(() => {
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
      meta.push({
        externalId: row.externalId,
        label,
      });
    }
    return meta;
  }, [rows, fields, database.primaryFieldId]);

  // A live connector hands down a fresh `rows` array on every tick, so pin the
  // loader's row set to its content: the symbols only change when the sync adds
  // or drops one, and re-reading history per price tick would thrash IndexedDB.
  const rowMetaKey = rowMetaSignature(tickedRowMeta);
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity is keyed by the content signature
  const rowMeta = useMemo(() => tickedRowMeta, [rowMetaKey]);

  const source = database.source;
  const connectorId =
    source?.kind === "connector" ? source.connectorId : undefined;
  const connectorConfig = source?.kind === "connector" ? source.config : {};
  const databaseId = database.id;
  const connector = connectorId ? getConnector(connectorId) : undefined;
  const needsBackfill = Boolean(fieldId && connector?.fetchHistory);

  const {
    data: backfillPoints,
    isError: backfillError,
    isFetching: backfillPending,
  } = useQuery({
    queryKey: [
      "connectors",
      "history-backfill",
      databaseId,
      rowMetaKey,
      resolution,
      connectorConfig,
      effectiveWindow,
    ] as const,
    enabled: needsBackfill,
    staleTime: BACKFILL_STALE_MS,
    queryFn: async (): Promise<ConnectorHistoryPoint[][]> => {
      const token = connectorId
        ? ((await Promise.resolve(getConnectorToken(connectorId)).catch(
            () => undefined
          )) ?? undefined)
        : undefined;
      const ctx: ConnectorFetchContext = {
        config: connectorConfig,
        fetchFn: (input, init) => fetch(input, init),
        token,
      };
      const to = Date.now();
      const from = to - effectiveWindow;
      return await Promise.all(
        rowMeta.map(
          async (meta) =>
            (await connector?.fetchHistory?.(ctx, {
              externalId: meta.externalId,
              from,
              to,
              resolution,
            })) ?? []
        )
      );
    },
  });
  const effectiveBackfillPoints =
    backfillPoints ??
    (backfillError || !needsBackfill ? EMPTY_BACKFILL_POINTS : undefined);

  const [data, setData] = useState<TimeSeriesChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fieldId) {
      setData(null);
      setLoading(false);
      return;
    }
    if (!effectiveBackfillPoints) {
      return;
    }
    const activeBackfillPoints = effectiveBackfillPoints;
    let cancelled = false;
    const activeFieldId = fieldId;

    async function load() {
      const to = Date.now();
      const from = to - effectiveWindow;
      const series = await Promise.all(
        rowMeta.map(async (meta, index): Promise<TimeSeriesLine> => {
          const local = clipToWindow(
            await readFieldHistory(databaseId, meta.externalId, activeFieldId),
            from,
            to
          );
          const points = clipToWindow(
            stitchSeries(activeBackfillPoints[index] ?? [], local, bucketMs),
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
  }, [
    databaseId,
    fieldId,
    effectiveWindow,
    rowMeta,
    effectiveBackfillPoints,
    bucketMs,
  ]);

  return {
    data,
    loading: loading || (Boolean(fieldId) && backfillPending && data === null),
  };
}
