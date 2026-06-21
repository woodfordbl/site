export interface UrlPreview {
  description?: string;
  imageUrl?: string;
  title?: string;
}

const TITLE_REGEX = /<title[^>]*>([^<]*)<\/title>/i;

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function extractMetaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    const value = match?.[1]?.trim();
    if (value) {
      return decodeHtmlEntities(value);
    }
  }

  return;
}

function pickMeta(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = extractMetaContent(html, key);
    if (value) {
      return value;
    }
  }
  return;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) {
    return true;
  }
  if (a === 127) {
    return true;
  }
  if (a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return false;
}

/** Reject URLs that could target internal networks (SSRF guard). */
export function assertSafeUnfurlUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "::1"
  ) {
    throw new Error("Local URLs are not allowed");
  }

  if (isPrivateIpv4(hostname)) {
    throw new Error("Private network URLs are not allowed");
  }

  return parsed;
}

export function parseUrlPreviewFromHtml(
  html: string,
  pageUrl: string
): UrlPreview {
  const titleMatch = TITLE_REGEX.exec(html);
  const title =
    pickMeta(html, ["og:title", "twitter:title"]) ??
    titleMatch?.[1]?.trim() ??
    undefined;
  const description = pickMeta(html, [
    "og:description",
    "twitter:description",
    "description",
  ]);
  const imageRaw = pickMeta(html, ["og:image", "twitter:image"]);

  let imageUrl: string | undefined;
  if (imageRaw) {
    try {
      imageUrl = new URL(imageRaw, pageUrl).href;
    } catch {
      imageUrl = undefined;
    }
  }

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}
