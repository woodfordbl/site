import { useCallback, useRef, useSyncExternalStore } from "react";

import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import type { LocalDatabase } from "@/lib/schemas/database.ts";

const SERVER_LOCAL_DATABASES: LocalDatabase[] = [];

function readLiveLocalDatabases(): LocalDatabase[] {
  if (typeof window === "undefined") {
    return SERVER_LOCAL_DATABASES;
  }
  return localDatabasesCollection.toArray;
}

/**
 * SSR-safe subscription to the local databases collection.
 *
 * Components on the SSR render path (the sidebar renders on every page) MUST
 * NOT read this collection via TanStack DB's `useLiveQuery`: it subscribes
 * through `useSyncExternalStore` without a server snapshot, and React responds
 * by aborting the whole server render ("Missing getServerSnapshot") and
 * silently reverting the site to client rendering — crawlers get an empty
 * shell. Mirrors `useLocalPages` / `useKeybindingOverrideRows`.
 */
export function useLocalDatabasesSnapshot(): LocalDatabase[] {
  const liveSnapshotRef = useRef<LocalDatabase[]>(readLiveLocalDatabases());

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    liveSnapshotRef.current = readLiveLocalDatabases();

    const subscription = localDatabasesCollection.subscribeChanges(() => {
      liveSnapshotRef.current = readLiveLocalDatabases();
      onStoreChange();
    });

    if (localDatabasesCollection.isReady()) {
      liveSnapshotRef.current = readLiveLocalDatabases();
      onStoreChange();
    }

    return () => subscription.unsubscribe();
  }, []);

  const getSnapshot = useCallback(() => liveSnapshotRef.current, []);
  const getServerSnapshot = useCallback(() => SERVER_LOCAL_DATABASES, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
