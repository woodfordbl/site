import { useCallback, useEffect, useState } from "react";

import { readSnapshotIndex } from "@/db/snapshots/page-snapshot-store.ts";
import type { PageSnapshotDescriptor } from "@/lib/pages/page-snapshot-types.ts";

export interface UsePageSnapshotsResult {
  descriptors: PageSnapshotDescriptor[];
  isLoading: boolean;
  refresh: () => void;
}

/**
 * Loads a page's snapshot descriptors (newest first) when `enabled` is true —
 * e.g. only while the version-history menu is open. IndexedDB has no live query,
 * so `refresh()` re-reads after a restore writes new checkpoints.
 */
export function usePageSnapshots(
  pageId: string,
  enabled: boolean
): UsePageSnapshotsResult {
  const [descriptors, setDescriptors] = useState<PageSnapshotDescriptor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey forces a manual re-read after restore
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let ignore = false;
    setIsLoading(true);
    readSnapshotIndex(pageId)
      .then((index) => {
        if (ignore) {
          return;
        }
        const sorted = [...index.descriptors].sort(
          (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
        );
        setDescriptors(sorted);
        setIsLoading(false);
      })
      .catch(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [pageId, enabled, reloadKey]);

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  return { descriptors, isLoading, refresh };
}
