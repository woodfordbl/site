import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";
import { toBlock } from "@/lib/schemas/local-block.ts";

function blockById(blocks: Block[]): Map<string, Block> {
  return new Map(blocks.map((block) => [block.id, block]));
}

function pickNewerBlock(
  localBlock: Block,
  remoteBlock: Block,
  localUpdatedAt: string | undefined,
  remoteUpdatedAt: string
): Block {
  if (!localUpdatedAt) {
    return remoteBlock;
  }

  return remoteUpdatedAt >= localUpdatedAt ? remoteBlock : localBlock;
}

/**
 * Merges remote collection blocks into the active tab's block list.
 * Focused block keeps local content; other blocks use LWW by updatedAt.
 */
export function mergeBlocksOnSync(
  localBlocks: Block[],
  localUpdatedAt: Map<string, string>,
  remoteLocalBlocks: LocalBlock[],
  focusedBlockId: string | null
): Block[] {
  const remoteBlocks = remoteLocalBlocks.map(toBlock);
  const remoteOrder = remoteBlocks.map((block) => block.id);
  const localMap = blockById(localBlocks);
  const remoteMap = blockById(remoteBlocks);
  const remoteTimes = new Map(
    remoteLocalBlocks.map((block) => [block.id, block.updatedAt])
  );

  const mergedIds = new Set<string>();
  const merged: Block[] = [];

  for (const id of remoteOrder) {
    const remoteBlock = remoteMap.get(id);
    if (!remoteBlock) {
      continue;
    }

    const localBlock = localMap.get(id);
    if (!localBlock) {
      merged.push(remoteBlock);
      mergedIds.add(id);
      continue;
    }

    if (id === focusedBlockId) {
      merged.push(localBlock);
      mergedIds.add(id);
      continue;
    }

    merged.push(
      pickNewerBlock(
        localBlock,
        remoteBlock,
        localUpdatedAt.get(id),
        remoteTimes.get(id) ?? remoteBlock.id
      )
    );
    mergedIds.add(id);
  }

  for (const localBlock of localBlocks) {
    if (!mergedIds.has(localBlock.id)) {
      merged.push(localBlock);
    }
  }

  return merged;
}
