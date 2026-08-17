import { z } from "zod";

import { blockSchema } from "./block.ts";

export const localBlockSchema = blockSchema.and(
  z.object({
    pageId: z.string(),
    /**
     * Durable per-block position key (`fractional-indexing` order key).
     * Rows sort lexicographically by this key; see
     * `src/lib/blocks/fractional-order.ts`. Optional for back-compat with
     * pre-migration rows and shipped-content seeds — readers fall back to the
     * page's legacy `blockOrder` mirror for rows that lack it.
     */
    fractionalIndex: z.string().optional(),
    /** Set once when the block row is first inserted; optional for back-compat. */
    createdAt: z.string().optional(),
    updatedAt: z.string(),
  })
);

export type LocalBlock = z.infer<typeof localBlockSchema>;

export function toLocalBlock(
  block: z.infer<typeof blockSchema>,
  pageId: string,
  updatedAt: string,
  createdAt?: string
): LocalBlock {
  return {
    ...block,
    pageId,
    createdAt: createdAt ?? updatedAt,
    updatedAt,
  };
}

export function toBlock(localBlock: LocalBlock): z.infer<typeof blockSchema> {
  const {
    pageId: _pageId,
    // Stripped so ordering keys never leak into block hashes/diff equality.
    fractionalIndex: _fractionalIndex,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...block
  } = localBlock;
  return block;
}

/**
 * Same LocalBlock object → same Block object, so live-query emissions keep
 * block identity for unchanged rows (feeds row-level structural sharing).
 */
const blockConversionCache = new WeakMap<
  LocalBlock,
  z.infer<typeof blockSchema>
>();

export function blocksFromLocalBlocks(
  localBlocks: LocalBlock[]
): z.infer<typeof blockSchema>[] {
  return localBlocks.map((localBlock) => {
    const cached = blockConversionCache.get(localBlock);
    if (cached) {
      return cached;
    }
    const block = toBlock(localBlock);
    blockConversionCache.set(localBlock, block);
    return block;
  });
}
