import { getAsset } from "@/db/assets/asset-store.ts";
import type { MediaProps } from "@/lib/schemas/block-props.ts";

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

export async function copyMediaImage(
  props: MediaProps,
  displayUrl: string
): Promise<boolean> {
  if (!navigator.clipboard?.write) {
    return false;
  }

  const blob = await resolveMediaBlob(props, displayUrl);
  if (!blob) {
    return false;
  }

  const mimeType =
    blob.type ||
    props.mimeType ||
    (props.kind === "video" ? "video/mp4" : "image/png");

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        [mimeType]: blob,
      }),
    ]);
    return true;
  } catch {
    return false;
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
    // Silent fail — no toast system.
  }
}
