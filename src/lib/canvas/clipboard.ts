import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import type { Block } from "@/lib/schemas/block.ts";

export interface CanvasClipboardPayload {
  blocks: Block[];
}

function createId(): string {
  return crypto.randomUUID();
}

/**
 * Clone blocks for paste with fresh ids. `parentId` references within the
 * cloned set are remapped to the new ids so container subtrees stay intact;
 * references to blocks outside the set are dropped so those blocks become
 * subtree roots at the paste destination.
 */
export function cloneBlocksForPaste(blocks: Block[]): Block[] {
  const idMap = new Map(blocks.map((block) => [block.id, createId()]));

  return blocks.map((block) => ({
    ...structuredClone(block),
    id: idMap.get(block.id) ?? createId(),
    parentId: block.parentId ? (idMap.get(block.parentId) ?? null) : null,
  }));
}

export function blocksToPlainText(blocks: Block[]): string {
  return blocks.map((block) => getTextFromBlock(block)).join("\n");
}

export function payloadFromBlocks(blocks: Block[]): CanvasClipboardPayload {
  return { blocks: structuredClone(blocks) };
}
