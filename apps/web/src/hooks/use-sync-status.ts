import { useCallback, useSyncExternalStore } from "react";

import {
  type DatabaseSyncStatus,
  getSyncStatus,
  subscribeSyncStatus,
} from "@/db/sync/database-sync-engine.ts";

/** Stable server snapshot — SSR has no engine, so status is always idle. */
const SERVER_STATUS: DatabaseSyncStatus = { syncing: false };

/**
 * Live sync status (syncing / lastSyncedAt / error) for one database, pushed
 * by the sync engine — no polling. The engine stores one immutable status
 * object per state change, so `getSyncStatus` is a valid
 * `useSyncExternalStore` snapshot; follower tabs simply stay at the idle
 * status (their rows arrive via storage events from the leader).
 */
export function useSyncStatus(databaseId: string): DatabaseSyncStatus {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      subscribeSyncStatus(databaseId, onStoreChange),
    [databaseId]
  );
  const getSnapshot = useCallback(
    () => getSyncStatus(databaseId),
    [databaseId]
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATUS);
}
