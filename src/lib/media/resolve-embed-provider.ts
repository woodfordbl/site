export interface EmbedProviderMatch {
  embedUrl: string;
  provider: "youtube" | "vimeo";
}

const YOUTUBE_SHORTS_PATH_RE = /^\/shorts\/([^/]+)/;
const VIMEO_ID_PATH_RE = /^\/(\d+)/;
const HTTP_SCHEME_RE = /^https?:\/\//i;

function parseYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (
      parsed.hostname.endsWith("youtube.com") ||
      parsed.hostname.endsWith("youtube-nocookie.com")
    ) {
      const id = parsed.searchParams.get("v");
      if (id) {
        return `https://www.youtube.com/embed/${id}`;
      }
      const shortsMatch = parsed.pathname.match(YOUTUBE_SHORTS_PATH_RE);
      if (shortsMatch?.[1]) {
        return `https://www.youtube.com/embed/${shortsMatch[1]}`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function parseVimeoEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("vimeo.com")) {
      return null;
    }
    const id = parsed.pathname.match(VIMEO_ID_PATH_RE)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  } catch {
    return null;
  }
}

export function resolveEmbedProvider(url: string): EmbedProviderMatch | null {
  const youtube = parseYouTubeEmbedUrl(url);
  if (youtube) {
    return { provider: "youtube", embedUrl: youtube };
  }
  const vimeo = parseVimeoEmbedUrl(url);
  if (vimeo) {
    return { provider: "vimeo", embedUrl: vimeo };
  }
  return null;
}

export function normalizeEmbedUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (HTTP_SCHEME_RE.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
