import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import { type LocalPage, localPageSchema } from "@/lib/schemas/local-page.ts";

const LOCAL_PAGES_STORAGE_KEY = "site-local-pages";
const SERVER_LOCAL_PAGES: LocalPage[] = [];

function readBootstrapLocalPages(): LocalPage[] {
  return readLocalStorageCollection(LOCAL_PAGES_STORAGE_KEY, localPageSchema);
}

function readLiveLocalPages(): LocalPage[] {
  if (typeof window === "undefined") {
    return SERVER_LOCAL_PAGES;
  }

  return localPagesCollection.toArray;
}

function useLocalPagesSnapshot(): LocalPage[] {
  const liveSnapshotRef = useRef<LocalPage[]>(readLiveLocalPages());

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    liveSnapshotRef.current = readLiveLocalPages();

    const subscription = localPagesCollection.subscribeChanges(() => {
      liveSnapshotRef.current = readLiveLocalPages();
      onStoreChange();
    });

    if (localPagesCollection.isReady()) {
      liveSnapshotRef.current = readLiveLocalPages();
      onStoreChange();
    }

    return () => subscription.unsubscribe();
  }, []);

  const getSnapshot = useCallback(() => liveSnapshotRef.current, []);
  const getServerSnapshot = useCallback(() => SERVER_LOCAL_PAGES, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useLocalPages(): LocalPage[] {
  const bootstrapPages = useMemo(() => readBootstrapLocalPages(), []);
  const collectionPages = useLocalPagesSnapshot();
  const isReady =
    typeof window !== "undefined" && localPagesCollection.isReady();

  return isReady ? collectionPages : bootstrapPages;
}

export function useLocalPageById(pageId: string): LocalPage | null {
  const localPages = useLocalPages();

  return useMemo(
    () => localPages.find((page) => page.id === pageId) ?? null,
    [localPages, pageId]
  );
}
