import { z } from "zod";

export const localPageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  parentId: z.string().nullable(),
  /** Flat block ids in document order for this page's shard. */
  blockOrder: z.array(z.string()).optional(),
  serverBaselineHash: z.string().nullable(),
  /** When set, the page is hidden locally (server JSON is unchanged). */
  deletedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LocalPage = z.infer<typeof localPageSchema>;

export function isUserCreatedPage(page: LocalPage): boolean {
  return page.serverBaselineHash === null;
}

export function isLocallyDeletedPage(page: LocalPage): boolean {
  return page.deletedAt != null;
}

/** Legacy shape before blocks were split into localBlocksCollection. */
export const legacyLocalPageSchema = localPageSchema.extend({
  blocks: z.array(z.unknown()),
});
