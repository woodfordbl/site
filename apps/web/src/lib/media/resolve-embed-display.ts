import { isDirectImageUrl } from "@/lib/media/infer-media-kind.ts";
import { resolveEmbedProvider } from "@/lib/media/resolve-embed-provider.ts";

export type EmbedDisplayKind = "provider" | "directImage" | "bookmark";

export interface EmbedDisplayResolution {
  kind: EmbedDisplayKind;
  provider?: ReturnType<typeof resolveEmbedProvider>;
}

/** Classify how an embed URL should render: iframe, direct image, or OG bookmark. */
export function resolveEmbedDisplay(url: string): EmbedDisplayResolution {
  const trimmed = url.trim();
  if (!trimmed) {
    return { kind: "bookmark" };
  }

  const provider = resolveEmbedProvider(trimmed);
  if (provider) {
    return { kind: "provider", provider };
  }

  if (isDirectImageUrl(trimmed)) {
    return { kind: "directImage" };
  }

  return { kind: "bookmark" };
}
