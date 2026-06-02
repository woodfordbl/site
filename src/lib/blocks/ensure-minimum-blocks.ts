import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { isBlockEmpty } from "@/lib/blocks/is-block-empty.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { getBlockParentId } from "@/lib/schemas/block.ts";

const LEGACY_EDITOR_BLOCK_ID = /-(?:minimum|trailing)(?:-relocated)?$/;

export function isLegacyEditorBlockId(blockId: string): boolean {
  return LEGACY_EDITOR_BLOCK_ID.test(blockId);
}

/** Rewrites old sentinel-style ids to normal UUIDs (one-time compatibility). */
export function rewriteLegacyEditorBlockIds(blocks: Block[]): Block[] {
  const idMap = new Map<string, string>();

  for (const block of blocks) {
    if (isLegacyEditorBlockId(block.id)) {
      idMap.set(block.id, crypto.randomUUID());
    }
  }

  if (idMap.size === 0) {
    return blocks;
  }

  return blocks.map((block) => {
    const id = idMap.get(block.id) ?? block.id;
    const parentId = getBlockParentId(block);
    const nextParentId =
      parentId === null ? null : (idMap.get(parentId) ?? parentId);

    if (id === block.id && nextParentId === parentId) {
      return block;
    }

    return {
      ...block,
      id,
      parentId: nextParentId,
    };
  });
}

export interface NormalizeEditablePageBlocksOptions {
  createBlankBlock?: () => Extract<Block, { type: "text" }>;
}

export interface NormalizeEditablePageBlocksResult {
  blocks: Block[];
  changed: boolean;
}

function lastRootBlock(blocks: Block[]): Block | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block && getBlockParentId(block) === null) {
      return block;
    }
  }
  return;
}

function defaultCreateBlankBlock(): Extract<Block, { type: "text" }> {
  return createEmptyBlock("text") as Extract<Block, { type: "text" }>;
}

/** Ensures at least one trailing empty top-level text row when the last row is not already blank. */
export function normalizeEditablePageBlocks(
  blocks: Block[],
  options?: NormalizeEditablePageBlocksOptions
): NormalizeEditablePageBlocksResult {
  const createBlankBlock = options?.createBlankBlock ?? defaultCreateBlankBlock;
  const rewritten = rewriteLegacyEditorBlockIds(blocks);
  const lastRoot = lastRootBlock(rewritten);

  if (lastRoot?.type === "text" && isBlockEmpty(lastRoot)) {
    return {
      blocks: rewritten,
      changed: rewritten !== blocks,
    };
  }

  return {
    blocks: [...rewritten, createBlankBlock()],
    changed: true,
  };
}

export function ensureEditablePageBlocks(
  blocks: Block[],
  options?: NormalizeEditablePageBlocksOptions
): Block[] {
  return normalizeEditablePageBlocks(blocks, options).blocks;
}
