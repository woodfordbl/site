import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { FieldHistoryPoint } from "@/db/history/field-history-types.ts";
import { getConnector } from "@/lib/connectors/registry.ts";
import { getConnectorToken } from "@/lib/connectors/token-store.ts";
import { ensureSeriesCoverageMany } from "@/lib/databases/ensure-series-coverage.ts";
import {
  computeLiveMarketsDerivedOverlay,
  LIVE_MARKETS_CHANGE_WINDOW_MS,
  type LiveMarketsDerivedOverlay,
  withLiveMarketsDerivedValues,
} from "@/lib/databases/live-markets-derived.ts";
import { resolutionForWindow } from "@/lib/databases/time-series-chart-data.ts";
import type {
  DatabaseField,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

/**
 * Two-phase live-markets derived metrics: ensure 24h price coverage for every
 * synced row, then overlay Change (series pct) + Market cap (Float × Price).
 */

const COVERAGE_STALE_MS = 60_000;

export interface UseLiveMarketsDerivedResult {
  /** True while the first coverage pass is in flight. */
  changePending: boolean;
  /** Rows with derived Change / Market cap merged in. */
  rows: LocalDatabaseRow[];
}

function isLiveMarketsDatabase(
  database: LocalDatabase | null | undefined
): boolean {
  return (
    database?.source?.kind === "connector" &&
    database.source.connectorId === "live-markets"
  );
}

/**
 * When `database` is Stocks and Crypto, ensure 24h price series coverage and
 * return rows with derived Change / Market cap. Otherwise returns `rows` as-is.
 */
export function useLiveMarketsDerivedRows(
  database: LocalDatabase | null | undefined,
  fields: readonly DatabaseField[],
  rows: readonly LocalDatabaseRow[]
): UseLiveMarketsDerivedResult {
  const enabled = isLiveMarketsDatabase(database);
  const databaseId = database?.id ?? "";
  const sourceConfig =
    database?.source?.kind === "connector" ? database.source.config : {};
  const connector = enabled ? getConnector("live-markets") : undefined;
  const priceFieldId = fields.find((field) => field.sourceKey === "price")?.id;

  const externalIds = useMemo(() => {
    const ids: string[] = [];
    for (const row of rows) {
      if (row.externalId) {
        ids.push(row.externalId);
      }
    }
    return ids;
  }, [rows]);

  const externalIdsKey = externalIds.join("\u0001");

  const { data: seriesByExternalId, isFetching } = useQuery({
    queryKey: [
      "live-markets",
      "change-coverage",
      databaseId,
      priceFieldId,
      externalIdsKey,
      sourceConfig,
    ] as const,
    enabled: enabled && Boolean(priceFieldId) && externalIds.length > 0,
    staleTime: COVERAGE_STALE_MS,
    queryFn: async (): Promise<Map<string, FieldHistoryPoint[]>> => {
      if (!(connector && priceFieldId)) {
        return new Map();
      }
      const token =
        (await Promise.resolve(getConnectorToken("live-markets")).catch(
          () => undefined
        )) ?? undefined;
      const to = Date.now();
      const from = to - LIVE_MARKETS_CHANGE_WINDOW_MS;
      const resolution = resolutionForWindow(LIVE_MARKETS_CHANGE_WINDOW_MS);
      const covered = await ensureSeriesCoverageMany(
        externalIds.map((externalId) => ({
          databaseId,
          externalId,
          fieldId: priceFieldId,
          from,
          to,
          resolution,
        })),
        {
          connector,
          config: sourceConfig,
          fetchFn: globalThis.fetch.bind(globalThis),
          token,
        }
      );
      const map = new Map<string, FieldHistoryPoint[]>();
      for (const [index, externalId] of externalIds.entries()) {
        map.set(externalId, covered[index] ?? []);
      }
      return map;
    },
  });

  const overlay: LiveMarketsDerivedOverlay = useMemo(() => {
    if (!enabled) {
      return new Map();
    }
    return computeLiveMarketsDerivedOverlay(
      fields,
      rows,
      seriesByExternalId ?? new Map(),
      Date.now(),
      { coverageReady: seriesByExternalId !== undefined }
    );
  }, [enabled, fields, rows, seriesByExternalId]);

  const merged = useMemo(() => {
    if (!enabled) {
      return [...rows];
    }
    return withLiveMarketsDerivedValues(fields, rows, overlay);
  }, [enabled, fields, rows, overlay]);

  return {
    rows: merged,
    changePending: enabled && isFetching && seriesByExternalId === undefined,
  };
}
