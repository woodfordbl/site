import { getAsset } from "@/db/assets/asset-store.ts";
import { extensionFromMimeType } from "@/lib/media/infer-media-kind.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { Page } from "@/lib/schemas/page.ts";

export interface MediaAssetExportPayload {
  assetId: string;
  base64: string;
  extension: string;
  mimeType: string;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function collectMediaAssetExports(
  blocks: Block[]
): Promise<MediaAssetExportPayload[]> {
  const seen = new Set<string>();
  const exports: MediaAssetExportPayload[] = [];

  for (const block of blocks) {
    if (
      block.type !== "media" ||
      block.props.source !== "asset" ||
      !block.props.src
    ) {
      continue;
    }
    const assetId = block.props.src;
    if (seen.has(assetId)) {
      continue;
    }
    seen.add(assetId);

    const blob = await getAsset(assetId);
    if (!blob) {
      throw new Error(`Missing local media asset: ${assetId}`);
    }

    exports.push({
      assetId,
      base64: await blobToBase64(blob),
      extension: extensionFromMimeType(block.props.mimeType ?? blob.type),
      mimeType: block.props.mimeType ?? blob.type,
    });
  }

  return exports;
}

export function rewriteMediaBlocksToPublicUrls(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    if (
      block.type !== "media" ||
      block.props.source !== "asset" ||
      !block.props.src
    ) {
      return block;
    }
    const extension = extensionFromMimeType(block.props.mimeType);
    return {
      ...block,
      props: {
        ...block.props,
        source: "url" as const,
        src: `/media/${block.props.src}.${extension}`,
      },
    };
  });
}

export async function preparePageDocumentForAuthorSave(
  doc: Page
): Promise<{ doc: Page; assets: MediaAssetExportPayload[] }> {
  const assets = await collectMediaAssetExports(doc.blocks);
  return {
    assets,
    doc: {
      ...doc,
      blocks: rewriteMediaBlocksToPublicUrls(doc.blocks),
    },
  };
}
