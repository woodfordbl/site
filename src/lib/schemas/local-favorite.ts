import { z } from "zod";

/**
 * A favorited page. One row per favorite; `id` is the page id so the same store
 * works for both user-created (local) and shipped (served) pages — only the id
 * is stored and resolved against the merged page list at render time.
 */
export const localFavoriteSchema = z.object({
  id: z.string(),
  /** Sidebar order within the Favorites section (lower sorts first). */
  order: z.number(),
  createdAt: z.string(),
});

export type LocalFavorite = z.infer<typeof localFavoriteSchema>;
