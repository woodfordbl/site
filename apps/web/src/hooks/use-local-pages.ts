import { useRouteContext } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readLocalStorageCollection } from "@/db/collections/read-local-storage-sync.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { mergeLocalPageSources } from "@/lib/pages/merge-local-page-sources.ts";
import { localPagesFromPreviewEntries } from "@/lib/pages/page-list-local-preview-cookie.ts";
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

/**
 * Live local page rows straight from the collection — no router context, no
 * preview-cookie merge. Prefer {@link useLocalPages}; this is for consumers
 * that render outside a route (or in tests without a router) and only need
 * whatever the collection currently holds.
 */
export function useLocalPagesSnapshot(): LocalPage[] {
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
  const { localPagePreview } = useRouteContext({ from: "__root__" });
  const previewPages = useMemo(
    () => localPagesFromPreviewEntries(localPagePreview),
    [localPagePreview]
  );
  const bootstrapPages = useMemo(() => readBootstrapLocalPages(), []);
  const collectionPages = useLocalPagesSnapshot();
  const isReady = isClient && localPagesCollection.isReady();

  if (!isClient) {
    return previewPages;
  }

  if (!isReady) {
    return mergeLocalPageSources(previewPages, bootstrapPages);
  }

  // Ready: the collection IS `site-local-pages`, so it is authoritative —
  // about absence as much as presence. The cookie preview and the mount-time
  // storage read exist only to cover the window before it hydrates, and
  // merging them back in afterwards resurrected every hard-deleted page,
  // because `mergeLocalPageSources` resolves per id and a deleted user page
  // leaves no id behind to win with. Clearing a database's row pages then
  // showed "Clear 1 row page…" until the next reload.
  if (collectionPages.length > 0) {
    return collectionPages;
  }

  // Empty and ready is ambiguous: either every local page is gone, or this
  // collection has not caught up with storage yet. Re-read rather than trust
  // the mount-time snapshot, which cannot tell the two apart.
  const storedPages = readBootstrapLocalPages();
  return storedPages.length > 0
    ? mergeLocalPageSources(previewPages, storedPages)
    : SERVER_LOCAL_PAGES;
}

/** True while local page rows may still be repopulating after collection init/HMR. */
export function useLocalPagesSettling(): boolean {
  const isClient = useIsClient();
  const { localPagePreview } = useRouteContext({ from: "__root__" });
  const previewPages = useMemo(
    () => localPagesFromPreviewEntries(localPagePreview),
    [localPagePreview]
  );
  const bootstrapPages = useMemo(() => readBootstrapLocalPages(), []);
  const collectionPages = useLocalPagesSnapshot();
  const isReady = isClient && localPagesCollection.isReady();

  if (!isClient) {
    return false;
  }

  if (!isReady) {
    const merged = mergeLocalPageSources(previewPages, bootstrapPages);
    if (merged.length > 0) {
      return false;
    }

    return bootstrapPages.length > 0;
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
