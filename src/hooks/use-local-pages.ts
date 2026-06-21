import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
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
  const isClient = useIsClient();
  const bootstrapPages = useMemo(() => readBootstrapLocalPages(), []);
  const collectionPages = useLocalPagesSnapshot();
  const isReady = isClient && localPagesCollection.isReady();

  if (!isClient) {
    return SERVER_LOCAL_PAGES;
  }

  if (!isReady) {
    return bootstrapPages;
  }

  if (collectionPages.length > 0) {
    return collectionPages;
  }

  // Empty collection is ambiguous: Vite HMR can reload the module with an
  // empty snapshot before sync repopulates, but deleting the last local page
  // also empties it. localStorage disambiguates — real deletions persist
  // there, so an empty store means genuinely no local pages.
  return readBootstrapLocalPages().length > 0
    ? bootstrapPages
    : SERVER_LOCAL_PAGES;
}

/** True while local page rows may still be repopulating after collection init/HMR. */
export function useLocalPagesSettling(): boolean {
  const isClient = useIsClient();
  const bootstrapPages = useMemo(() => readBootstrapLocalPages(), []);
  const collectionPages = useLocalPagesSnapshot();
  const isReady = isClient && localPagesCollection.isReady();

  if (!(isClient && isReady)) {
    return true;
  }

  if (collectionPages.length > 0 || bootstrapPages.length === 0) {
    return false;
  }

  // See useLocalPages: re-read storage so deleting the last local page does
  // not read as "settling" forever.
  return readBootstrapLocalPages().length > 0;
}

export function useLocalPageById(pageId: string): LocalPage | null {
  const localPages = useLocalPages();

  return useMemo(
    () => localPages.find((page) => page.id === pageId) ?? null,
    [localPages, pageId]
  );
}
