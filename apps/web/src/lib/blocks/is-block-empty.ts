import {
  type BlockFor,
  getBlockDef,
  isContainerBlockType,
} from "@/lib/blocks/block-defs.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

export function isBlockEmpty(block: Block): boolean {
  const isEmpty = getBlockDef(block.type).isEmpty as (
    candidate: BlockFor<BlockType>
  ) => boolean;
  return isEmpty(block);
}

/** Containers are empty rows when they have no children; leaves defer to the def. */
export function isRowEmpty(block: Block, childCount: number): boolean {
  if (isContainerBlockType(block.type)) {
    // A container that also carries primary text (toggleHeading) is empty only
    // when its title is blank AND it has no children.
    if (getBlockDef(block.type).hasPrimaryText) {
      return childCount === 0 && isBlockEmpty(block);
    }
    return childCount === 0;
  }
  return isBlockEmpty(block);
}
