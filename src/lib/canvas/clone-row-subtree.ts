import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { flattenRows } from "@/db/queries/merge-blocks.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import type { Block } from "@/lib/schemas/block.ts";

function createId(): string {
  return crypto.randomUUID();
}

/** Clone a row subtree with remapped block ids so parentId references stay valid. */
export function cloneRowSubtreeBlocks(row: CanvasRow): Block[] {
  const flatRows = flattenRows([row]);
  const idMap = new Map<string, string>();

  for (const flatRow of flatRows) {
    idMap.set(flatRow.effectiveBlock.id, createId());
  }

  return flatRows.map((flatRow) => {
    const source = flatRow.effectiveBlock;
    const next = createEmptyBlock(source.type);
    const parentId = source.parentId
      ? (idMap.get(source.parentId) ?? null)
      : null;

    return {
      ...next,
      id: idMap.get(source.id) ?? createId(),
      indent: source.indent,
      parentId,
      props: structuredClone(source.props),
    } as Block;
  });
}
