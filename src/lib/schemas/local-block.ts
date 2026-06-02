import { z } from "zod";

import { blockSchema } from "./block.ts";

export const localBlockSchema = blockSchema.and(
  z.object({
    pageId: z.string(),
    updatedAt: z.string(),
  })
);

export type LocalBlock = z.infer<typeof localBlockSchema>;

export function toLocalBlock(
  block: z.infer<typeof blockSchema>,
  pageId: string,
  updatedAt: string
): LocalBlock {
  return {
    ...block,
    pageId,
    updatedAt,
  };
}

export function toBlock(localBlock: LocalBlock): z.infer<typeof blockSchema> {
  const { pageId: _pageId, updatedAt: _updatedAt, ...block } = localBlock;
  return block;
}

export function blocksFromLocalBlocks(
  localBlocks: LocalBlock[]
): z.infer<typeof blockSchema>[] {
  return localBlocks.map(toBlock);
}
