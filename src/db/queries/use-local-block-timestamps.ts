import { eq, useLiveQuery } from "@tanstack/react-db";

import { localBlocksCollection } from "@/db/collections/local-collections.ts";

export interface LocalBlockTimestamps {
  createdAt: string | null;
  updatedAt: string | null;
}

/** Reactive `createdAt` / `updatedAt` for one block row (TanStack DB source). */
export function useLocalBlockTimestamps(
  blockId: string | undefined
): LocalBlockTimestamps {
  const { data = [] } = useLiveQuery(
    (query) =>
      query
        .from({ block: localBlocksCollection })
        .where(({ block }) => eq(block.id, blockId ?? "")),
    [blockId]
  );

  const row = blockId ? data[0] : undefined;
  return {
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}
