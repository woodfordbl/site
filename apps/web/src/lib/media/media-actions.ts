import { getAsset } from "@/db/assets/asset-store.ts";
import type { MediaProps } from "@/lib/schemas/block-props.ts";

/** Clipboard APIs across Chromium/Safari only reliably accept PNG for images. */
const CLIPBOARD_IMAGE_MIME = "image/png";

function extensionFromMime(mimeType: string | undefined): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    default:
      return "bin";
  }
}

function downloadFileName(props: MediaProps): string {
  if (props.fileName?.trim()) {
    return props.fileName.trim();
  }
  const ext = extensionFromMime(props.mimeType);
  return `media-${props.src.slice(0, 8)}.${ext}`;
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function resolveMediaBlob(
  props: MediaProps,
  displayUrl: string
): Promise<Blob | null> {
  if (props.source === "asset") {
    return (await getAsset(props.src)) ?? null;
  }

  try {
    const response = await fetch(displayUrl);
    if (!response.ok) {
      return null;
    }
    return await response.blob();
  } catch {
    return null;
  }
}

/**
 * Rasterizes an image blob to PNG. Needed because `navigator.clipboard.write`
 * only accepts `image/png` on Safari and most Chromium builds — Unsplash
 * covers commonly arrive as JPEG/WebP via `auto=format`.
 */
async function blobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === CLIPBOARD_IMAGE_MIME) {
    return blob;
  }

  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create canvas context");
    }
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, CLIPBOARD_IMAGE_MIME);
    });
    if (!png) {
      throw new Error("Could not encode PNG");
    }
    return png;
  } finally {
    bitmap.close();
  }
}

/** Returns the URL to copy for "Copy link" — external src or resolved display URL. */
export function resolveMediaLinkUrl(
  props: MediaProps,
  displayUrl: string
): string {
  if (props.source === "url") {
    return props.src;
  }
  return displayUrl;
}

export async function downloadMedia(
  props: MediaProps,
  displayUrl: string
): Promise<void> {
  const blob = await resolveMediaBlob(props, displayUrl);
  if (blob) {
    triggerBlobDownload(blob, downloadFileName(props));
    return;
  }

  if (props.source === "url") {
    const anchor = document.createElement("a");
    anchor.href = props.src;
    anchor.download = downloadFileName(props);
    anchor.rel = "noopener";
    anchor.target = "_blank";
    anchor.click();
  }
}

/**
 * Copies the rendered image onto the system clipboard so it can be pasted
 * elsewhere (and into the canvas as a media file paste).
 *
 * Starts `clipboard.write` synchronously with a Promise-based
 * {@link ClipboardItem} so the call still counts as user-activated after the
 * async fetch finishes. Images are converted to PNG for browser compatibility.
 */
export async function copyMediaImage(
  props: MediaProps,
  displayUrl: string
): Promise<boolean> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    return false;
  }

  // Videos have no portable clipboard image representation.
  if (props.kind === "video") {
    return false;
  }

  const pngPromise = (async () => {
    const blob = await resolveMediaBlob(props, displayUrl);
    if (!blob) {
      throw new Error("Could not load image");
    }
    return blobToPng(blob);
  })();

  try {
    // Pass the Promise into ClipboardItem (not an awaited Blob) so the write
    // begins during the user gesture; the browser then waits on the Promise.
    await navigator.clipboard.write([
      new ClipboardItem({
        [CLIPBOARD_IMAGE_MIME]: pngPromise,
      }),
    ]);
    return true;
  } catch {
    // Fallback for environments that reject Promise-valued ClipboardItems
    // (older Chromium): await the PNG, then write a resolved Blob.
    try {
      const png = await pngPromise;
      await navigator.clipboard.write([
        new ClipboardItem({
          [CLIPBOARD_IMAGE_MIME]: png,
        }),
      ]);
      return true;
    } catch {
      return false;
    }
  }
}

export async function copyMediaLink(
  props: MediaProps,
  displayUrl: string
): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(resolveMediaLinkUrl(props, displayUrl));
  } catch {
    // Silent fail — callers that care about feedback toast independently.
  }
}
