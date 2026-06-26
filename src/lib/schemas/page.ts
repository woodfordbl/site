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
  blocks: z.array(blockSchema),
  ...pageSettingsSchema.shape,
});

export type Page = z.infer<typeof pageSchema>;
