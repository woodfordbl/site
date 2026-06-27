import { useQuery } from "@tanstack/react-query";

import {
  listSnapshotPageIds,
  readSnapshotIndex,
} from "@/db/snapshots/page-snapshot-store.ts";
import type { SnapshotPageDescriptors } from "@/lib/pages/content-timeline.ts";

async function fetchSnapshotDescriptors(): Promise<SnapshotPageDescriptors[]> {
  const pageIds = await listSnapshotPageIds();
  const pages: SnapshotPageDescriptors[] = [];

  for (const pageId of pageIds) {
    const index = await readSnapshotIndex(pageId);
    pages.push({
      pageId,
      descriptors: index.descriptors.map((descriptor) => ({
        timestamp: descriptor.timestamp,
        wordCount: descriptor.wordCount,
      })),
    });
  }

  return pages;
}

export function useSnapshotTimeline(enabled = true) {
  const query = useQuery({
    enabled,
    queryFn: fetchSnapshotDescriptors,
    queryKey: ["snapshot-timeline"],
    staleTime: 60_000,
  });

  return {
    pages: query.data ?? [],
    isLoading: query.isLoading,
  };
}
