import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { inferMediaKindFromMime } from "@/lib/media/infer-media-kind.ts";
import type { Block } from "@/lib/schemas/block.ts";

type MediaBlock = Extract<Block, { type: "media" }>;

/** True for the image/video MIME types we render as inline media blocks. */
export function isMediaFile(file: File): boolean {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

/**
 * Pulls image/video files out of a paste or drop `DataTransfer`. Pasting a
 * screenshot or copied image exposes the bytes as a file entry; non-media
 * payloads (plain text, internal block clipboard) yield an empty list.
 */
export function extractMediaFiles(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }
  return Array.from(data.files).filter(isMediaFile);
}

export interface StoredMediaAsset {
  assetId: string;
  fileName?: string;
  mimeType: string;
}

/** Builds a media block backed by a content-addressed IndexedDB asset. */
export function buildAssetMediaBlock(asset: StoredMediaAsset): MediaBlock {
  return {
    ...createEmptyBlock("media"),
    props: {
      kind: inferMediaKindFromMime(asset.mimeType),
      source: "asset",
      src: asset.assetId,
      mimeType: asset.mimeType,
      ...(asset.fileName?.trim() ? { fileName: asset.fileName } : {}),
    },
  };
}
