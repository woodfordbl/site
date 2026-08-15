import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import type { Block } from "@/lib/schemas/block.ts";

/** Clone all page blocks with remapped ids so parentId references stay valid. */
export function clonePageBlocks(blocks: Block[]): Block[] {
  const idMap = new Map<string, string>();

  for (const block of blocks) {
    idMap.set(block.id, crypto.randomUUID());
  }

  return blocks.map((block) => {
    const source = block;
    const next = createEmptyBlock(source.type);
    const parentId = source.parentId
      ? (idMap.get(source.parentId) ?? null)
      : null;

    return {
      ...next,
      id: idMap.get(source.id) ?? crypto.randomUUID(),
      indent: source.indent,
      parentId,
      props: structuredClone(source.props),
    } as Block;
  });
}
