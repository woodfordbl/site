export interface UrlPreview {
  description?: string;
  faviconUrl?: string;
  imageUrl?: string;
  siteName?: string;
  title?: string;
}

const TITLE_REGEX = /<title[^>]*>([^<]*)<\/title>/i;

const FAVICON_LINK_PATTERNS = [
  /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
  /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
  /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
  /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i,
] as const;

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

function resolveAbsoluteUrl(
  raw: string | undefined,
  pageUrl: string
): string | undefined {
  if (!raw) {
    return;
  }
  try {
    return new URL(raw, pageUrl).href;
  } catch {
    return;
  }
}

function extractFaviconUrl(html: string, pageUrl: string): string | undefined {
  for (const pattern of FAVICON_LINK_PATTERNS) {
    const match = pattern.exec(html);
    const resolved = resolveAbsoluteUrl(match?.[1]?.trim(), pageUrl);
    if (resolved) {
      return resolved;
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

/**
 * Parse Open Graph / Twitter / favicon metadata from an HTML document.
 * Used by embed bookmarks and inline link hover previews.
 */
export function parseUrlPreviewFromHtml(
  html: string,
  pageUrl: string
): UrlPreview {
  const titleMatch = TITLE_REGEX.exec(html);
  const titleFromDoc = titleMatch?.[1]?.trim();
  const title =
    pickMeta(html, ["og:title", "twitter:title"]) ??
    (titleFromDoc ? decodeHtmlEntities(titleFromDoc) : undefined);
  const description = pickMeta(html, [
    "og:description",
    "twitter:description",
    "description",
  ]);
  const imageUrl = resolveAbsoluteUrl(
    pickMeta(html, ["og:image", "twitter:image"]),
    pageUrl
  );
  const siteName = pickMeta(html, ["og:site_name"]);
  const faviconUrl = extractFaviconUrl(html, pageUrl);

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(siteName ? { siteName } : {}),
    ...(faviconUrl ? { faviconUrl } : {}),
  };
}
