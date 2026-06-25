import type { QueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";

import type { PageIconPickerEmojiPanelProps } from "@/components/pages/page-icon-picker-emoji-panel.tsx";
import type { PageIconPickerIconPanelProps } from "@/components/pages/page-icon-picker-icon-panel.tsx";
import { tablerIconCatalogQueryOptions } from "@/lib/pages/page-icon-catalog.ts";
import { emojiCatalogQueryOptions } from "@/lib/pages/page-icon-emoji-catalog.ts";

let emojiPanelPromise: Promise<
  ComponentType<PageIconPickerEmojiPanelProps>
> | null = null;
let iconPanelPromise: Promise<
  ComponentType<PageIconPickerIconPanelProps>
> | null = null;

/**
 * Warms the code-split emoji panel chunk. Returns a cached promise resolving to a component type;
 * store it with a functional updater — `setPanel(() => panel)` — not `.then(setPanel)`.
 */
export function preloadPageIconEmojiPanel(): Promise<
  ComponentType<PageIconPickerEmojiPanelProps>
> {
  emojiPanelPromise ??= import(
    "@/components/pages/page-icon-picker-emoji-panel.tsx"
  ).then((module) => module.PageIconPickerEmojiPanel);
  return emojiPanelPromise;
}

/** Warms the code-split icon panel chunk (Base UI Autocomplete + virtualizer + glyph renderer). */
export function preloadPageIconIconPanel(): Promise<
  ComponentType<PageIconPickerIconPanelProps>
> {
  iconPanelPromise ??= import(
    "@/components/pages/page-icon-picker-icon-panel.tsx"
  ).then((module) => module.PageIconPickerIconPanel);
  return iconPanelPromise;
}

/** Warms both deferred catalog assets into the TanStack Query cache (shared across routes). */
export function prefetchPageIconCatalogs(queryClient: QueryClient): void {
  queryClient.prefetchQuery(emojiCatalogQueryOptions).catch(() => {
    /* best-effort */
  });
  queryClient.prefetchQuery(tablerIconCatalogQueryOptions).catch(() => {
    /* best-effort */
  });
}

/** Idle global warmup: code-split panel chunks only (no JSON catalogs). */
export function warmPageIconPickerChunks(): void {
  preloadPageIconEmojiPanel().catch(() => {
    /* best-effort */
  });
  preloadPageIconIconPanel().catch(() => {
    /* best-effort */
  });
}

/**
 * Picker intent entry point: panel chunks + both catalog assets.
 * Called on pointer enter and popover open — not on every route.
 * @see docs/architecture/pages.md#page-icons
 */
export function ensurePageIconPickerReady(queryClient: QueryClient): void {
  warmPageIconPickerChunks();
  prefetchPageIconCatalogs(queryClient);
}
