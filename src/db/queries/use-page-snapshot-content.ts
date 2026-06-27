import { useEffect, useState } from "react";

import { readSnapshotContent } from "@/db/snapshots/page-snapshot-store.ts";
import type { PageSnapshotContent } from "@/lib/pages/page-snapshot-types.ts";

export interface UsePageSnapshotContentResult {
  content: PageSnapshotContent | null;
  isLoading: boolean;
}

/** Loads one checkpoint's full payload from IndexedDB when a version is selected. */
export function usePageSnapshotContent(
  pageId: string,
  snapshotId: string | null
): UsePageSnapshotContentResult {
  const [content, setContent] = useState<PageSnapshotContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!snapshotId) {
      setContent(null);
      setIsLoading(false);
      return;
    }

    let ignore = false;
    setIsLoading(true);
    readSnapshotContent(pageId, snapshotId)
      .then((result) => {
        if (ignore) {
          return;
        }
        setContent(result ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        if (!ignore) {
          setContent(null);
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [pageId, snapshotId]);

  return { content, isLoading };
}
