"use client";

import { useMemo } from "react";

import { GridPicker } from "@/components/ui/grid-picker.tsx";
import {
  type EmojiCatalogItem,
  useEmojiCatalog,
} from "@/lib/pages/page-icon-emoji-catalog.ts";
import { useRecentlyUsedPageIcons } from "@/lib/pages/recently-used-page-icons.ts";

export interface PageIconPickerEmojiPanelProps {
  onSelect: (emoji: string) => void;
}

/** Lazy-loaded emoji grid for {@link PageIconPicker}, backed by the deferred emoji catalog. */
export function PageIconPickerEmojiPanel({
  onSelect,
}: PageIconPickerEmojiPanelProps) {
  const { data: items = [] } = useEmojiCatalog();
  const { emoji: recentEmojis } = useRecentlyUsedPageIcons();

  // Resolve recent emoji characters to catalog items, dropping any no longer present.
  const recentItems = useMemo(() => {
    if (recentEmojis.length === 0 || items.length === 0) {
      return [];
    }
    const byEmoji = new Map(items.map((item) => [item.emoji, item]));
    return recentEmojis
      .map((emoji) => byEmoji.get(emoji))
      .filter((item): item is EmojiCatalogItem => item !== undefined);
  }, [items, recentEmojis]);

  return (
    <GridPicker<EmojiCatalogItem>
      emptyMessage="No emoji found."
      getItemLabel={(item) => item.label}
      getKey={(item) => item.emoji}
      getSearchValue={(item) => item.keywords}
      items={items}
      onSelect={(item) => onSelect(item.emoji)}
      overscan={24}
      recentItems={recentItems}
      renderItem={(item) => (
        <span className="text-lg leading-none">{item.emoji}</span>
      )}
      searchAriaLabel="Search emojis"
      searchPlaceholder="Search emojis…"
    />
  );
}
