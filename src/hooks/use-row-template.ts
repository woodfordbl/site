import { eq, useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import { localBlocksCollection } from "@/db/collections/local-collections.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import { databaseTemplatePageId } from "@/lib/databases/database-template-page.ts";
import type { RowTemplateSnapshot } from "@/lib/databases/row-template-store.ts";
import { blocksFromLocalBlocks } from "@/lib/schemas/local-block.ts";
import { isLocallyDeletedPage } from "@/lib/schemas/local-page.ts";

import { useLocalPageById } from "./use-local-pages.ts";

/**
 * Reactive read of a database's row-template snapshot: the sentinel page's
 * blocks in document order plus the settings row pages inherit (icon, font).
 * Null when the database has no custom template — callers fall back to the
 * built-in blank default. Live: template edits re-render open row pages.
 */
export function useRowTemplate(databaseId: string): RowTemplateSnapshot | null {
  const templatePageId = databaseTemplatePageId(databaseId);
  const record = useLocalPageById(templatePageId);
  const { data: localBlocks = [] } = useLiveQuery(
    (query) =>
      query
        .from({ block: localBlocksCollection })
        .where(({ block }) => eq(block.pageId, templatePageId)),
    [templatePageId]
  );

  return useMemo(() => {
    if (!record || isLocallyDeletedPage(record)) {
      return null;
    }
    return {
      blocks: orderBlocksByIds(
        blocksFromLocalBlocks(localBlocks),
        record.blockOrder
      ),
      font: record.font,
      icon: record.icon,
    };
  }, [record, localBlocks]);
}
