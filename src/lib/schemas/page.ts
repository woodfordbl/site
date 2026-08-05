import { z } from "zod";

import { blockSchema } from "./block.ts";
import { pageSettingsSchema } from "./page-settings.ts";

export const pageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  parentId: z.string().nullable(),
  sidebarOrder: z.number().optional(),
  /**
   * Authored timestamps, written by dev "Save to source". Optional because
   * pages shipped before they existed carry no history to recover.
   */
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  blocks: z.array(blockSchema),
  ...pageSettingsSchema.shape,
});

export type Page = z.infer<typeof pageSchema>;
