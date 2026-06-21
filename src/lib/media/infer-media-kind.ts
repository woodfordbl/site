import type { MediaKind } from "@/lib/schemas/block-props.ts";

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "ogv", "avi"]);

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

export function extensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url, "https://placeholder.local").pathname;
    const segment = pathname.split("/").pop() ?? "";
    const dotIndex = segment.lastIndexOf(".");
    if (dotIndex === -1) {
      return null;
    }
    return segment.slice(dotIndex + 1).toLowerCase();
  } catch {
    return null;
  }
}

export function inferMediaKindFromMime(
  mimeType: string | undefined
): MediaKind {
  if (mimeType?.startsWith("video/")) {
    return "video";
  }
  return "image";
}

export function inferMediaKindFromUrl(url: string): MediaKind {
  const extension = extensionFromUrl(url);
  if (extension && VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  return "image";
}

/** True when the URL path ends in a known raster/vector image extension. */
export function isDirectImageUrl(url: string): boolean {
  const extension = extensionFromUrl(url);
  return extension !== null && IMAGE_EXTENSIONS.has(extension);
}

export function extensionFromMimeType(mimeType: string | undefined): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "bin";
  }
}
