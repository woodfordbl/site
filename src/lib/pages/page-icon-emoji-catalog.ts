import { queryOptions, useQuery } from "@tanstack/react-query";

import {
  PAGE_ICON_EMOJI_LOCALE,
  PAGE_ICON_EMOJIBASE_URL,
} from "@/lib/pages/page-icon-emojibase.ts";

export interface EmojiCatalogItem {
  emoji: string;
  /** `label` plus tags, joined for substring search. */
  keywords: string;
  label: string;
}

export interface EmojibaseEntry {
  emoji?: string;
  group?: number;
  label?: string;
  order?: number;
  tags?: string[];
}

/**
 * Flattens raw Emojibase entries into searchable catalog items: drops component-only entries
 * (no `group`), orders by Emojibase `order`, and joins label + tags into a search string.
 */
export function parseEmojiCatalog(
  entries: EmojibaseEntry[]
): EmojiCatalogItem[] {
  return entries
    .filter(
      (
        entry
      ): entry is Required<Pick<EmojibaseEntry, "emoji" | "label">> &
        EmojibaseEntry =>
        entry.group !== undefined &&
        typeof entry.emoji === "string" &&
        typeof entry.label === "string"
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((entry) => ({
      emoji: entry.emoji,
      label: entry.label,
      keywords: `${entry.label} ${(entry.tags ?? []).join(" ")}`,
    }));
}

async function fetchEmojiCatalog(): Promise<EmojiCatalogItem[]> {
  const response = await fetch(
    `${PAGE_ICON_EMOJIBASE_URL}/${PAGE_ICON_EMOJI_LOCALE}/data.json`,
    { cache: "force-cache" }
  );
  if (!response.ok) {
    throw new Error(`Failed to load emoji catalog (${response.status})`);
  }
  return parseEmojiCatalog((await response.json()) as EmojibaseEntry[]);
}

/** Shared query for the deferred emoji catalog (self-hosted Emojibase JSON, parsed once). */
export const emojiCatalogQueryOptions = queryOptions({
  queryKey: ["page-icon", "emoji-catalog"],
  queryFn: fetchEmojiCatalog,
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: Number.POSITIVE_INFINITY,
});

export function useEmojiCatalog(enabled = true) {
  return useQuery({ ...emojiCatalogQueryOptions, enabled });
}
