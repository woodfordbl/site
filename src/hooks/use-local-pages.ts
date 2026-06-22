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
    // Match SSR first paint: cookie preview when the user has local edits.
    if (previewPages.length > 0) {
      return previewPages;
    }

    return bootstrapPages;
  }

  const livePages =
    collectionPages.length > 0
      ? collectionPages
      : readBootstrapLocalPages().length > 0
        ? bootstrapPages
        : SERVER_LOCAL_PAGES;

  return mergeLocalPageSources(previewPages, bootstrapPages, livePages);
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
    if (previewPages.length > 0) {
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
