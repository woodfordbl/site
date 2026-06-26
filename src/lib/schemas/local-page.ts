import { z } from "zod";

import { pageSettingsSchema } from "./page-settings.ts";

export const localPageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  parentId: z.string().nullable(),
  /** Sidebar sibling order within the same parentId scope. */
  sidebarOrder: z.number().optional(),
  /** Flat block ids in document order for this page's shard. */
  blockOrder: z.array(z.string()).optional(),
  serverBaselineHash: z.string().nullable(),
  /** Hash of shipped title/slug/icon/parent/sidebarOrder at lazy-seed time. */
  serverMetadataBaseline: z.string().optional(),
  /** When set, the page is hidden locally (server JSON is unchanged). */
  deletedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  ...pageSettingsSchema.shape,
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
