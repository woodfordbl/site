import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { readFieldHistory } from "@/db/history/field-history-store.ts";
import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import { getConnector } from "@/lib/connectors/registry.ts";
import { getConnectorToken } from "@/lib/connectors/token-store.ts";
import { formatCellValue } from "@/lib/databases/cell-values.ts";
import { ensureSeriesCoverageMany } from "@/lib/databases/ensure-series-coverage.ts";
import {
  clipToWindow,
  DEFAULT_TIME_WINDOW_MS,
  presetForWindow,
  resolutionForWindow,
  windowDisplayRange,
  windowFetchRange,
} from "@/lib/databases/time-series-chart-data.ts";
import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Async loader for time-axis chart data: demand-fetches missing history via
 * {@link ensureSeriesCoverageMany} (shared with live-markets derived Change),
 * then clips to the visible window. Re-reads on a short interval so live ticks
 * extend the right edge without re-hitting the network when coverage is warm.
 *
 * The fetch range and the visible range are not the same thing — the day
 * window reaches further back than it shows so it can fall back to the last
 * session that traded (see `time-series-chart-data.ts`). The extra coverage is
 * fetched, then clipped away by {@link clipLinesToDisplay} before the chart
 * ever sees it.
 */

/** One symbol's line: stable key + display label + covered points. */
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

/** Live re-read cadence (ms) — cheap once coverage is cached in the store. */
const LIVE_REFRESH_MS = 2000;

/** Provider candles are historical; keep them fresh enough for scrolling windows. */
const BACKFILL_STALE_MS = 60_000;

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

/**
 * Narrow already-fetched lines to the window the chart shows. The day window
 * covers more than it displays, and the visible left edge depends on the
 * timestamps that came back, so this can only run once the data is in hand.
 */
function clipLinesToDisplay(
  lines: readonly TimeSeriesLine[],
  windowMs: number,
  now: number
): TimeSeriesLine[] {
  const range = windowDisplayRange(
    windowMs,
    lines.flatMap((line) => line.points.map((point) => point.t)),
    now
  );
  return lines.map((line) => ({
    ...line,
    points: clipToWindow(line.points, range.from, range.to),
  }));
}

async function loadSeriesLines(args: {
  databaseId: string;
  fieldId: string;
  from: number;
  to: number;
  resolution: ReturnType<typeof resolutionForWindow>;
  rowMeta: readonly RowMeta[];
  connectorId: string | undefined;
  connectorConfig: Record<string, unknown>;
}): Promise<TimeSeriesLine[]> {
  const {
    databaseId,
    fieldId,
    from,
    to,
    resolution,
    rowMeta,
    connectorId,
    connectorConfig,
  } = args;

  const connector = connectorId ? getConnector(connectorId) : undefined;
  if (connector?.fetchHistory) {
    const token =
      (await Promise.resolve(getConnectorToken(connector.id)).catch(
        () => undefined
      )) ?? undefined;
    const covered = await ensureSeriesCoverageMany(
      rowMeta.map((meta) => ({
        databaseId,
        externalId: meta.externalId,
        fieldId,
        from,
        to,
        resolution,
      })),
      {
        connector,
        config: connectorConfig,
        fetchFn: globalThis.fetch.bind(globalThis),
        token,
      }
    );
    return rowMeta.map((meta, index) => ({
      key: meta.externalId,
      label: meta.label,
      points: covered[index] ?? [],
    }));
  }

  return await Promise.all(
    rowMeta.map(async (meta) => ({
      key: meta.externalId,
      label: meta.label,
      points: clipToWindow(
        await readFieldHistory(databaseId, meta.externalId, fieldId),
        from,
        to
      ),
    }))
  );
}

export function useTimeSeriesChartData(
  database: LocalDatabase,
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[],
  fieldId: string | undefined,
  windowMs: number | undefined
): UseTimeSeriesResult {
  // Snap to a preset rather than trusting the stored number: a view saved
  // against a window the control no longer offers still resolves to the
  // nearest one it does.
  const effectiveWindow = presetForWindow(
    windowMs ?? DEFAULT_TIME_WINDOW_MS
  ).windowMs;
  const resolution = resolutionForWindow(effectiveWindow);

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

  const {
    data: querySeries,
    isError: queryError,
    isFetching: queryPending,
  } = useQuery({
    queryKey: [
      "connectors",
      "series-coverage",
      databaseId,
      fieldId,
      rowMetaKey,
      resolution,
      connectorConfig,
      effectiveWindow,
    ] as const,
    enabled: Boolean(fieldId),
    staleTime: BACKFILL_STALE_MS,
    queryFn: async (): Promise<TimeSeriesLine[]> => {
      if (!fieldId) {
        return [];
      }
      const now = Date.now();
      const range = windowFetchRange(effectiveWindow, now);
      const lines = await loadSeriesLines({
        databaseId,
        fieldId,
        from: range.from,
        to: range.to,
        resolution,
        rowMeta,
        connectorId,
        connectorConfig,
      });
      return clipLinesToDisplay(lines, effectiveWindow, now);
    },
  });

  const [liveSeries, setLiveSeries] = useState<TimeSeriesLine[] | null>(null);

  // Promote RQ result into local state, then refresh on an interval so live
  // ticks extend the right edge. Dependencies are primitives / stable rowMeta
  // — never the connector object identity.
  useEffect(() => {
    if (!fieldId) {
      setLiveSeries(null);
      return;
    }
    if (queryError && !querySeries) {
      setLiveSeries([]);
      return;
    }
    if (!querySeries) {
      return;
    }
    setLiveSeries(querySeries);

    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled || !fieldId) {
        return;
      }
      const now = Date.now();
      const range = windowFetchRange(effectiveWindow, now);
      loadSeriesLines({
        databaseId,
        fieldId,
        from: range.from,
        to: range.to,
        resolution,
        rowMeta,
        connectorId,
        connectorConfig,
      })
        .then((series) => {
          if (!cancelled) {
            setLiveSeries(clipLinesToDisplay(series, effectiveWindow, now));
          }
        })
        .catch(() => undefined);
    }, LIVE_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    fieldId,
    querySeries,
    queryError,
    effectiveWindow,
    databaseId,
    resolution,
    rowMeta,
    connectorId,
    connectorConfig,
  ]);

  const data = useMemo<TimeSeriesChartData | null>(() => {
    if (!fieldId || liveSeries === null) {
      return null;
    }
    const now = Date.now();
    const range = windowDisplayRange(
      effectiveWindow,
      liveSeries.flatMap((line) => line.points.map((point) => point.t)),
      now
    );
    return {
      series: liveSeries,
      from: range.from,
      to: range.to,
    };
  }, [fieldId, liveSeries, effectiveWindow]);

  return {
    data,
    loading: data === null && Boolean(fieldId) && (queryPending || !queryError),
  };
}
