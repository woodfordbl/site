"use client";

import { GridPicker } from "@/components/ui/grid-picker.tsx";
import {
  type EmojiCatalogItem,
  useEmojiCatalog,
} from "@/lib/pages/page-icon-emoji-catalog.ts";

export interface PageIconPickerEmojiPanelProps {
  onSelect: (emoji: string) => void;
}

/** Lazy-loaded emoji grid for {@link PageIconPicker}, backed by the deferred emoji catalog. */
export function PageIconPickerEmojiPanel({
  onSelect,
}: PageIconPickerEmojiPanelProps) {
  const { data: items = [] } = useEmojiCatalog();

  return (
    <GridPicker<EmojiCatalogItem>
      emptyMessage="No emoji found."
      getItemLabel={(item) => item.label}
      getKey={(item) => item.emoji}
      getSearchValue={(item) => item.keywords}
      items={items}
      onSelect={(item) => onSelect(item.emoji)}
      overscan={24}
      renderItem={(item) => (
        <span className="text-lg leading-none">{item.emoji}</span>
      )}
      searchAriaLabel="Search emojis"
      searchPlaceholder="Search emojis…"
    />
  );
}
