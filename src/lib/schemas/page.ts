import { z } from "zod";

import { blockSchema } from "./block.ts";

export const pageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  parentId: z.string().nullable(),
  blocks: z.array(blockSchema),
});

export type Page = z.infer<typeof pageSchema>;
