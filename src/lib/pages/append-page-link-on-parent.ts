import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { replacePageBlocks } from "@/db/queries/block-collection-ops.ts";
import { convertBlockType } from "@/lib/blocks/create-block.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";
import { blocksFromLocalBlocks } from "@/lib/schemas/local-block.ts";

function pageLinkTargetsPage(block: Block, pageId: string): boolean {
  return block.type === "pageLink" && block.props.pageId === pageId;
}

/** Appends a child `pageLink` at the end of a parent's block list (deduped by `pageId`). */
export function appendChildPageLinkOnParent(options: {
  childPageId: string;
  parentPageId: string;
  parentBlocks: Block[];
  existingLocalBlocks: LocalBlock[];
}): void {
  const { childPageId, parentPageId, parentBlocks, existingLocalBlocks } =
    options;

  const blockOrder = localPagesCollection.toArray.find(
    (page) => page.id === parentPageId
  )?.blockOrder;
  const ordered = orderBlocksByIds(parentBlocks, blockOrder);

  if (ordered.some((block) => pageLinkTargetsPage(block, childPageId))) {
    return;
  }

  const linkBlock = convertBlockType(
    { id: crypto.randomUUID(), type: "text", props: { text: "" } },
    "pageLink",
    { pageId: childPageId, pageLinkVariant: "child" }
  );

  const nextBlocks = [...ordered, linkBlock];
  replacePageBlocks(parentPageId, nextBlocks, existingLocalBlocks);
}

/** Loads the parent block shard, then calls `appendChildPageLinkOnParent`. */
export function appendChildPageLinkFromShard(options: {
  childPageId: string;
  parentPageId: string;
}): void {
  const existingLocalBlocks = readBlockShardForPage(options.parentPageId);
  const parentBlocks =
    existingLocalBlocks.length > 0
      ? blocksFromLocalBlocks(existingLocalBlocks)
      : [];

  appendChildPageLinkOnParent({
    childPageId: options.childPageId,
    parentPageId: options.parentPageId,
    parentBlocks,
    existingLocalBlocks,
  });
}
