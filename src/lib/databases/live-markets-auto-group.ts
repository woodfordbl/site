import {
  ASSET_CLASS_CRYPTO,
  ASSET_CLASS_EQUITY,
} from "@/lib/connectors/live-markets.ts";
import type { ConnectorRow } from "@/lib/connectors/types.ts";
import type { DatabaseView, LocalDatabase } from "@/lib/schemas/database.ts";

/**
 * Auto-group the default table view by Asset class when a live-markets sync
 * produces both crypto and equity rows — unless the user opted out
 * (`view.config.liveMarketsGrouping === "manual"`).
 */

const ASSET_CLASS_SOURCE_KEY = "assetClass";

/** True when connector snapshot rows include both crypto and equity classes. */
export function connectorRowsHaveMixedAssetClasses(
  rows: readonly ConnectorRow[]
): boolean {
  let hasCrypto = false;
  let hasEquity = false;
  for (const row of rows) {
    const value = row.values[ASSET_CLASS_SOURCE_KEY];
    if (value === ASSET_CLASS_CRYPTO) {
      hasCrypto = true;
    } else if (value === ASSET_CLASS_EQUITY) {
      hasEquity = true;
    }
    if (hasCrypto && hasEquity) {
      return true;
    }
  }
  return false;
}

/**
 * Patch for the primary table view when mixed asset classes should auto-group.
 * Returns `null` when no change is needed (already grouped, user opted out,
 * or only one asset class).
 */
export function liveMarketsAutoGroupPatch(
  database: LocalDatabase,
  rows: readonly ConnectorRow[]
): { viewId: string; patch: Partial<Omit<DatabaseView, "id">> } | null {
  if (database.source?.kind !== "connector") {
    return null;
  }
  if (database.source.connectorId !== "live-markets") {
    return null;
  }
  if (!connectorRowsHaveMixedAssetClasses(rows)) {
    return null;
  }

  const assetClassField = database.fields.find(
    (field) => field.sourceKey === ASSET_CLASS_SOURCE_KEY
  );
  if (!assetClassField) {
    return null;
  }

  const tableView =
    database.views.find((view) => view.type === "table") ?? database.views[0];
  if (!tableView) {
    return null;
  }
  if (tableView.config.liveMarketsGrouping === "manual") {
    return null;
  }
  if (tableView.groupBy?.fieldId === assetClassField.id) {
    return null;
  }
  // Only auto-apply when grouping is still unset — don't override a user's
  // grouping by another field.
  if (tableView.groupBy !== undefined) {
    return null;
  }

  return {
    viewId: tableView.id,
    patch: {
      groupBy: { fieldId: assetClassField.id },
      config: {
        ...tableView.config,
        liveMarketsGrouping: "auto",
        collapsedGroupKeys: undefined,
        hiddenGroupKeys: undefined,
      },
    },
  };
}
