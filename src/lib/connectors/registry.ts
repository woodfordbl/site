import { coingeckoMarketsConnector } from "@/lib/connectors/coingecko-markets.ts";
import { frankfurterRatesConnector } from "@/lib/connectors/frankfurter-rates.ts";
import { githubIssuesConnector } from "@/lib/connectors/github-issues.ts";
import { githubPrsConnector } from "@/lib/connectors/github-prs.ts";
import { githubReposConnector } from "@/lib/connectors/github-repos.ts";
import { liveMarketsConnector } from "@/lib/connectors/live-markets.ts";
import type { ConnectorDefinition } from "@/lib/connectors/types.ts";

/**
 * Static connector registry — the single source for every connector the
 * synced-database creation flow and the sync scheduler can resolve by
 * `DatabaseSource.connectorId`.
 */
export const CONNECTORS: Record<string, ConnectorDefinition> = {
  [githubReposConnector.id]: githubReposConnector,
  [githubPrsConnector.id]: githubPrsConnector,
  [githubIssuesConnector.id]: githubIssuesConnector,
  [coingeckoMarketsConnector.id]: coingeckoMarketsConnector,
  [liveMarketsConnector.id]: liveMarketsConnector,
  [frankfurterRatesConnector.id]: frankfurterRatesConnector,
};

/**
 * Resolve a connector by id. Returns `undefined` for unknown ids (e.g. a
 * database synced by a connector that no longer ships) — callers surface a
 * "connector unavailable" state rather than crash.
 */
export function getConnector(
  connectorId: string
): ConnectorDefinition | undefined {
  return CONNECTORS[connectorId];
}

/** All registered connectors, in registry (display) order. */
export function listConnectors(): ConnectorDefinition[] {
  return Object.values(CONNECTORS);
}
