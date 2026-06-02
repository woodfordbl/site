import {
  createEmptyBlock,
  getTextFromBlock,
} from "@/lib/blocks/create-block.ts";
import type { Block } from "@/lib/schemas/block.ts";

export interface CanvasClipboardPayload {
  blocks: Block[];
}

function createId(): string {
  return crypto.randomUUID();
}

export function cloneBlocksForPaste(blocks: Block[]): Block[] {
  return blocks.map((block) => cloneBlockWithNewIds(block));
}

function cloneBlockWithNewIds(block: Block): Block {
  const next = createEmptyBlock(block.type);
  const cloned: Block = {
    ...next,
    id: createId(),
    indent: block.indent,
    parentId: block.parentId ?? null,
    props: structuredClone(block.props),
  } as Block;
  return cloned;
}

export function blocksToPlainText(blocks: Block[]): string {
  return blocks.map((block) => getTextFromBlock(block)).join("\n");
}

export function payloadFromBlocks(blocks: Block[]): CanvasClipboardPayload {
  return { blocks: structuredClone(blocks) };
}
