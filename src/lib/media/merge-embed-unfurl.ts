import type { EmbedProps } from "@/lib/schemas/block-props.ts";

/** Merge OG unfurl preview fields into embed props for a normalized URL. */
export function mergeEmbedUnfurlPreview(
  props: EmbedProps,
  url: string,
  preview: { description?: string; imageUrl?: string; title?: string }
): EmbedProps {
  return {
    ...props,
    url,
    ...(preview.title ? { title: preview.title } : {}),
    ...(preview.description ? { description: preview.description } : {}),
    ...(preview.imageUrl ? { imageUrl: preview.imageUrl } : {}),
  };
}
