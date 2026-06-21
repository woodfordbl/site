import type { Block } from "@/lib/schemas/block.ts";

/** Order blocks by the page's `blockOrder`; ids missing from the order append after, keeping their relative position. */
export function orderBlocksByIds(
  blocks: Block[],
  blockOrder: string[] | null | undefined
): Block[] {
  if (!blockOrder?.length) {
    return blocks;
  }

  const byId = new Map(blocks.map((block) => [block.id, block]));
  const ordered: Block[] = [];

  for (const id of blockOrder) {
    const block = byId.get(id);
    if (block) {
      ordered.push(block);
      byId.delete(id);
    }
  }

  for (const block of byId.values()) {
    ordered.push(block);
  }

  return ordered;
}
