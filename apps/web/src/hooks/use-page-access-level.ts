import { useCallback, useSyncExternalStore } from "react";

import { myAccessCollection } from "@/db/collections/local-collections.ts";
import type { PageAccessLevel } from "@/lib/schemas/page-access.ts";

const getServerSnapshot = (): PageAccessLevel | null => null;

/**
 * The current user's effective access level for one page, live from the
 * `my_access` shape collection — grants, upgrades, and revocations re-render
 * subscribers without any refetching.
 *
 * Local mode returns `"full_access"` (single-user, no server). Synced mode
 * returns `null` when the shape holds no row for the page: the snapshot is
 * still loading, or the page is outside the synced domain (shipped content
 * that was never seeded). Callers must treat `null` as ungoverned — see
 * {@link isReadOnlyAccessLevel} for why that is safe.
 */
export function usePageAccessLevel(pageId: string): PageAccessLevel | null {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const collection = myAccessCollection;
    if (!collection) {
      return () => undefined;
    }
    const subscription = collection.subscribeChanges(onStoreChange);
    if (collection.isReady()) {
      onStoreChange();
    }
    return () => subscription.unsubscribe();
  }, []);

  const getSnapshot = useCallback(
    (): PageAccessLevel | null =>
      myAccessCollection
        ? (myAccessCollection.get(pageId)?.level ?? null)
        : "full_access",
    [pageId]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
