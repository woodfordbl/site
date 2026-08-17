import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { replacePageBlocks } from "@/db/queries/block-collection-ops.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";
import { blocksFromLocalBlocks } from "@/lib/schemas/local-block.ts";

function blockDatabaseId(props: unknown): string | undefined {
  if (typeof props !== "object" || props === null) {
    return;
  }
  const { databaseId } = props as { databaseId?: unknown };
  return typeof databaseId === "string" && databaseId !== ""
    ? databaseId
    : undefined;
}

function referencesDatabase(block: Block, databaseId: string): boolean {
  return (
    block.type === "database" && blockDatabaseId(block.props) === databaseId
  );
}

function createHostDatabaseBlock(databaseId: string): Block {
  return {
    ...createEmptyBlock("database"),
    props: { databaseId },
  };
}

/**
 * Appends a linked `database` block at the end of a host page's canvas
 * (deduped by `databaseId`). Mirrors {@link appendChildPageLinkOnParent}.
 */
export function appendDatabaseBlockOnHost(options: {
  databaseId: string;
  existingLocalBlocks: LocalBlock[];
  hostBlocks: Block[];
  hostPageId: string;
}): void {
  const { databaseId, existingLocalBlocks, hostBlocks, hostPageId } = options;

  const blockOrder = localPagesCollection.toArray.find(
    (page) => page.id === hostPageId
  )?.blockOrder;
  const ordered = orderBlocksByIds(hostBlocks, blockOrder);

  if (ordered.some((block) => referencesDatabase(block, databaseId))) {
    return;
  }

  replacePageBlocks(
    hostPageId,
    [...ordered, createHostDatabaseBlock(databaseId)],
    existingLocalBlocks
  );
}

/** Loads the host block shard, then calls {@link appendDatabaseBlockOnHost}. */
export function appendDatabaseBlockOnHostFromShard(options: {
  databaseId: string;
  hostPageId: string;
}): void {
  const existingLocalBlocks = readBlockShardForPage(options.hostPageId);
  const hostBlocks =
    existingLocalBlocks.length > 0
      ? blocksFromLocalBlocks(existingLocalBlocks)
      : [];

  appendDatabaseBlockOnHost({
    databaseId: options.databaseId,
    existingLocalBlocks,
    hostBlocks,
    hostPageId: options.hostPageId,
  });
}
